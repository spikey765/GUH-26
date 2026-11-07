import json
import datetime as dt
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import ai
import ai_config
import forecast as F
import settings
import statement
import store
from auth import current_user

DATA = settings.ROOT / "data"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


DEFAULT_PROFILE = load("profile.json")
TX = load("transactions.json")
EVENTS = load("events.json")
COUNCIL_TAX = load("council_tax.json")
TRANSACTIONS = TX["transactions"]

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
    result = F.project(TX["account"]["balance_gbp"], recurring, TRANSACTIONS, warnings, settings.TODAY, actions, shocks)
    result["shocks"] = [s for s in shocks if s.get("id") is not None]
    return result


def public(warnings):
    return [{k: v for k, v in w.items() if k != "_cost"} for w in warnings]


@app.get("/health")
def health():
    return {"ok": True, "auth": "supabase" if settings.SUPABASE_ON else "demo", "ai": ai_config.PROVIDER if settings.AI_ON else "rules", "model": ai_config.MODEL, "today": settings.TODAY.isoformat()}


@app.get("/profile")
async def get_profile(user=Depends(current_user)):
    profile, source = await profile_for(user)
    return {"profile": profile, "source": source}


@app.put("/profile")
async def put_profile(body: Profile, user=Depends(current_user)):
    saved = await store.save_profile(user, body.model_dump())
    return {"profile": saved, "source": "saved"}


ACCOUNT_LINES = [{"id": t["id"], "date": t["date"], "description": t["merchant"], "amount_gbp": t["amount_gbp"]} for t in TRANSACTIONS]
MAX_PDF_BYTES = 10 * 1024 * 1024


@app.post("/profile/guess")
async def guess_profile(file: Optional[UploadFile] = File(default=None), user=Depends(current_user)):
    pdf_bytes = None
    if file is not None:
        pdf_bytes = await file.read(MAX_PDF_BYTES + 1)
        if len(pdf_bytes) > MAX_PDF_BYTES:
            raise HTTPException(413, "That file is too big. Use a PDF under 10 MB.")
        try:
            text = statement.extract_text(pdf_bytes)
        except statement.NotAStatement as e:
            raise HTTPException(422, str(e))
        lines = statement.parse_transactions(text)
        if not text.strip():
            raise HTTPException(422, "We couldn't find any text in that PDF. Try a statement downloaded from your bank's app.")
        rule_input = statement.as_account_transactions(lines)
        what = f"a {len(pdf_bytes) // 1024} KB statement with {len(lines)} transactions"
    else:
        text, lines, rule_input = "", ACCOUNT_LINES, TRANSACTIONS
        what = f"{len(TRANSACTIONS)} account transactions"

    def verify(item):
        return statement.verify_evidence(item, lines, text)

    used = "rules"
    if settings.AI_ON:
        try:
            raw = await ai.ask_gemini(pdf_bytes, TRANSACTIONS)
            used = "gemini"
        except Exception as e:
            raw = ai.rule_based_guess(rule_input)
            await store.log_event(user, "profile_guess", f"Gemini call failed ({type(e).__name__}) on {what}; used simple rules instead")
    else:
        raw = ai.rule_based_guess(rule_input)
    guesses, dropped = ai.apply_guardrails(raw, verify)
    ai.fix_pay_range(guesses, lines)
    filled = sum(1 for g in guesses.values() if g["value"] not in (None, []))
    who = f"{ai_config.MODEL}" if used == "gemini" else "Simple rules (no Gemini key)" if not settings.AI_ON else "Simple rules"
    if used == "gemini" or not settings.AI_ON:
        await store.log_event(user, "profile_guess", f"{who} read {what}. Filled {filled} of {len(guesses)} fields. Dropped {dropped} evidence lines not found in the source.")
    return {"guesses": guesses, "source": used, "input": "statement" if pdf_bytes is not None else "account", "dropped_evidence": dropped}


@app.get("/forecast")
async def get_forecast(user=Depends(current_user)):
    _, actions, shocks, warnings, recurring = await state_for(user)
    result = run_forecast(warnings, recurring, actions, shocks)
    result["recurring"] = recurring
    return result


@app.get("/warnings")
async def get_warnings(user=Depends(current_user)):
    _, _, _, warnings, _ = await state_for(user)
    return {"warnings": public(warnings)}


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
    plan = F.saving_plan(body.amount_gbp, settings.TODAY, body.date)
    saved = run_forecast(warnings, recurring, actions, [*shocks, {**shock, "weekly_gbp": plan["weekly_gbp"]}]) if plan["weekly_gbp"] else shocked

    def view(f):
        return {
            "on_date": F.balance_on(f, body.date),
            "lowest_after": F.lowest_from(f, body.date),
            "worst_day": f["worst_day"],
            "tight_weeks": f["tight_weeks"],
        }

    return {
        "shock": shock,
        "before": view(base),
        "after": view(shocked),
        "with_saving": view(saved),
        "forecast": shocked,
        "saving_forecast": saved,
        "suggestion": plan,
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


@app.delete("/whatif/{action_id}")
async def remove_whatif(action_id: int, user=Depends(current_user)):
    await store.delete_whatif(user, action_id)
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
