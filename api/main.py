import json
import datetime as dt
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import ai
import ai_config
import forecast as F
import settings
import store
from auth import current_user

DATA = settings.ROOT / "data"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


DEFAULT_PROFILE = load("profile.json")
TX = load("transactions.json")
EVENTS = load("events.json")
COUNCIL_TAX = load("council_tax.json")
NEWS = load("news.json")["news"]
TRANSACTIONS = TX["transactions"]
TX_BY_ID = {t["id"]: t for t in TRANSACTIONS}

app = FastAPI(title="Heads Up API")
app.add_middleware(CORSMiddleware, allow_origins=settings.WEB_ORIGINS, allow_methods=["*"], allow_headers=["*"])


class Profile(BaseModel):
    job_type: Optional[str] = None
    contract_type: Optional[str] = None
    pay_frequency: Optional[str] = None
    pay_min_gbp: Optional[float] = None
    pay_max_gbp: Optional[float] = None
    adults: Optional[int] = None
    children_ages: list[int] = Field(default_factory=list)
    benefits: list[str] = Field(default_factory=list)
    housing: Optional[str] = None
    area: Optional[str] = None
    energy_payment: Optional[str] = None
    guessed_by_ai: bool = False


class Shock(BaseModel):
    amount_gbp: float = Field(gt=0, le=10000)
    date: dt.date
    label: str = Field(default="Unexpected cost", max_length=60)


class ActionIn(BaseModel):
    warning_id: str
    confirmed: bool
    amount_gbp: Optional[float] = None
    date: Optional[dt.date] = None
    label: Optional[str] = None
    weekly_gbp: Optional[float] = None


async def profile_for(user):
    saved = await store.get_profile(user)
    return (saved, "saved") if saved else (dict(DEFAULT_PROFILE, guessed_by_ai=False), "default")


async def state_for(user):
    profile, _ = await profile_for(user)
    actions, shocks = store.fold_actions(await store.list_actions(user))
    warnings, recurring = F.build_warnings(profile, TRANSACTIONS, EVENTS, settings.TODAY, actions)
    return profile, actions, shocks, warnings, recurring


def run_forecast(warnings, recurring, actions, shocks):
    return F.project(TX["account"]["balance_gbp"], recurring, TRANSACTIONS, warnings, settings.TODAY, actions, shocks)


def public(warnings):
    return [{k: v for k, v in w.items() if k != "_cost"} for w in warnings]


@app.get("/health")
def health():
    return {"ok": True, "auth": "supabase" if settings.SUPABASE_ON else "demo", "ai": "claude" if settings.AI_ON else "rules", "model": ai_config.MODEL, "today": settings.TODAY.isoformat()}


@app.get("/profile")
async def get_profile(user=Depends(current_user)):
    profile, source = await profile_for(user)
    return {"profile": profile, "source": source}


@app.put("/profile")
async def put_profile(body: Profile, user=Depends(current_user)):
    saved = await store.save_profile(user, body.model_dump())
    return {"profile": saved, "source": "saved"}


@app.post("/profile/guess")
async def guess_profile(user=Depends(current_user)):
    used = "rules"
    if settings.AI_ON:
        try:
            guesses, meta = await ai.guess_profile(TRANSACTIONS)
            used = "claude"
            await store.log_event(user, "profile_guess", f"{meta['model']} read {len(TRANSACTIONS)} transactions ({meta['input_tokens']} tokens in, {meta['output_tokens']} out) and guessed {len(guesses)} fields")
        except Exception as e:
            await store.log_event(user, "profile_guess", f"Claude call failed ({type(e).__name__}); used the rule-based guesser instead")
            guesses = ai.rule_based_guess(TRANSACTIONS)
    else:
        guesses = ai.rule_based_guess(TRANSACTIONS)
        await store.log_event(user, "profile_guess", f"No Claude API key set; rule-based guesser read {len(TRANSACTIONS)} transactions and guessed {len(guesses)} fields")
    for g in guesses.values():
        g["transactions"] = [TX_BY_ID[i] for i in g.get("transaction_ids", []) if i in TX_BY_ID]
        g["transaction_ids"] = [t["id"] for t in g["transactions"]]
    return {"guesses": guesses, "source": used}


@app.get("/forecast")
async def get_forecast(user=Depends(current_user)):
    _, actions, shocks, warnings, recurring = await state_for(user)
    result = run_forecast(warnings, recurring, actions, shocks)
    result["recurring"] = recurring
    result["shocks"] = shocks
    return result


@app.get("/warnings")
async def get_warnings(user=Depends(current_user)):
    _, _, _, warnings, _ = await state_for(user)
    return {"warnings": public(warnings)}


PROFILE_MATCH = ("area", "contract_type")


def news_applies(item, profile):
    cond = item.get("applies_if", {})
    if not F.applies({"applies_if": {k: v for k, v in cond.items() if k not in PROFILE_MATCH}}, profile, TRANSACTIONS):
        return False
    return all((profile.get(k) or "").lower() == cond[k].lower() for k in PROFILE_MATCH if k in cond)


@app.get("/news")
async def get_news(user=Depends(current_user)):
    profile, _ = await profile_for(user)
    items = [{k: v for k, v in n.items() if k != "applies_if"} for n in NEWS if news_applies(n, profile)]
    return {"news": sorted(items, key=lambda n: n["date"], reverse=True)}


def check_date(x):
    end = settings.TODAY.toordinal() + F.HORIZON_DAYS - 1
    if not settings.TODAY.toordinal() <= x.toordinal() <= end:
        raise HTTPException(422, "Pick a date in the next 60 days")


@app.post("/simulate")
async def simulate(body: Shock, user=Depends(current_user)):
    check_date(body.date)
    _, actions, shocks, warnings, recurring = await state_for(user)
    base = run_forecast(warnings, recurring, actions, shocks)
    shock = {"amount_gbp": body.amount_gbp, "date": body.date.isoformat(), "label": body.label}
    shocked = run_forecast(warnings, recurring, actions, [*shocks, shock])
    weekly = F.weekly_to_stay_safe(base, shocked, settings.TODAY, body.date)
    weeks = F.weeks_until(settings.TODAY, body.date)
    with_saving = run_forecast(warnings, recurring, actions, [*shocks, {**shock, "weekly_gbp": weekly}]) if weekly else shocked
    return {
        "shock": shock,
        "before": {"worst_day": base["worst_day"], "tight_weeks": base["tight_weeks"]},
        "forecast": shocked,
        "suggestion": {"weekly_gbp": weekly, "weeks": weeks, "worst_after_saving": with_saving["worst_day"]},
    }


@app.post("/actions")
async def post_action(body: ActionIn, user=Depends(current_user)):
    if body.warning_id == "whatif":
        if not (body.amount_gbp and body.date):
            raise HTTPException(422, "A what-if needs an amount and a date")
        check_date(body.date)
        if body.confirmed:
            detail = json.dumps({"amount_gbp": body.amount_gbp, "date": body.date.isoformat(), "label": body.label or "Unexpected cost"})
            await store.add_action(user, "whatif", detail, body.weekly_gbp or 0)
    else:
        if not any(e["id"] == body.warning_id for e in EVENTS):
            raise HTTPException(404, "No warning with that id")
        _, _, _, warnings, _ = await state_for(user)
        w = next((w for w in warnings if w["id"] == body.warning_id), None)
        weekly = w["suggestion"].get("weekly_gbp") if w else None
        await store.add_action(user, body.warning_id, "yes" if body.confirmed else "no", weekly)
    _, actions, shocks, warnings, recurring = await state_for(user)
    return {"forecast": run_forecast(warnings, recurring, actions, shocks), "warnings": public(warnings)}


@app.delete("/actions")
async def reset_actions(user=Depends(current_user)):
    await store.clear_actions(user)
    return {"ok": True}


@app.get("/council-tax")
async def council_tax(user=Depends(current_user)):
    parts = []
    for p in COUNCIL_TAX["parts"]:
        rise = p["amount_2026"] - p["amount_2025"]
        parts.append({**p, "rise_gbp": round(rise, 2), "rise_percent": round(rise / p["amount_2025"] * 100, 2)})
    total_25 = sum(p["amount_2025"] for p in COUNCIL_TAX["parts"])
    total_26 = sum(p["amount_2026"] for p in COUNCIL_TAX["parts"])
    nxt = round(total_26 * COUNCIL_TAX["next_april_rise_percent"] / 100, 2)
    return {**COUNCIL_TAX, "parts": parts, "total_2025": round(total_25, 2), "total_2026": round(total_26, 2), "rise_gbp": round(total_26 - total_25, 2), "next_april_estimate_gbp": round(total_26 + nxt, 2), "next_april_rise_gbp": nxt}


@app.get("/agent-log")
async def agent_log(user=Depends(current_user)):
    return {"events": await store.list_events(user)}
