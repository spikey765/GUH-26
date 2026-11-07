import json

import httpx
import datetime as dt
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import ai
import ai_config
import forecast as F
import settings
import page_text
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
NEWS = load("news.json")["news"]
TRANSACTIONS = TX["transactions"]

app = FastAPI(title="HeadsUp API")
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
    result["account"] = {"name": TX["account"]["name"], "as_of": TX["account"]["as_of"]}
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
            await store.log_event(user, "profile_guess", "Tried to fill in your answers but the AI didn't respond, so it used simple rules instead.")
    else:
        raw = ai.rule_based_guess(rule_input)
    guesses, dropped = ai.apply_guardrails(raw, verify)
    ai.fix_pay_range(guesses, lines)
    filled = sum(1 for g in guesses.values() if g["value"] not in (None, []))
    if used == "gemini" or not settings.AI_ON:
        await store.log_event(user, "profile_guess", f"Read {'your statement' if pdf_bytes is not None else 'your payments'} and filled in {filled} of {len(guesses)} answers for you to check." + (f" Ignored {dropped} lines it couldn't find on the statement." if dropped else ""))
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


PROFILE_MATCH = ("area", "contract_type")


def news_applies(item, profile):
    cond = item.get("applies_if", {})
    if not F.applies({"applies_if": {k: v for k, v in cond.items() if k not in PROFILE_MATCH}}, profile, TRANSACTIONS):
        return False
    return all((profile.get(k) or "").lower() == cond[k].lower() for k in PROFILE_MATCH if k in cond)


@app.get("/news")
async def get_news(user=Depends(current_user)):
    profile, _ = await profile_for(user)
    order = {"yours": 0, "general": 1, "not_you": 2}
    items = []
    for n in NEWS:
        fit = "general" if not n.get("applies_if") else "yours" if news_applies(n, profile) else "not_you"
        items.append({**{k: v for k, v in n.items() if k != "applies_if"}, "fit": fit})
    items.sort(key=lambda n: n["date"], reverse=True)
    items.sort(key=lambda n: order[n["fit"]])
    return {"news": items}


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


_summaries: dict[str, str] = {}


def user_facts(profile, warnings, fc):
    kids = profile.get("children_ages") or []
    lines = [
        f"Job: {profile.get('job_type') or 'not given'}, {profile.get('contract_type') or ''}, paid {(profile.get('pay_frequency') or '').lower()}",
        f"Usual weekly pay: £{profile.get('pay_min_gbp')} to £{profile.get('pay_max_gbp')}" if profile.get("pay_min_gbp") else "Usual weekly pay: not given",
        f"Household: {profile.get('adults') or 'unknown'} adult(s), children aged {', '.join(map(str, kids)) if kids else 'not given'}",
        f"Benefits: {', '.join(profile.get('benefits') or []) or 'none given'}",
        f"Housing: {profile.get('housing') or 'not given'}, in {profile.get('area') or 'not given'}",
        f"Pays for energy by: {profile.get('energy_payment') or 'not given'}",
        f"Balance today: £{fc['start_balance']:.2f}. Lowest point in the next 60 days: £{fc['worst_day']['balance']:.2f} on {fc['worst_day']['date']}",
    ]
    for w in warnings:
        if w.get("headline"):
            lines.append(f"Coming up for them: {w['title']} from {w['effective_date']}: {w['headline']}")
    return "\n".join(lines)


_summaries: dict[tuple[str, str], str] = {}


@app.get("/news/{news_id}/summary")
async def news_summary(news_id: str, user=Depends(current_user)):
    item = next((n for n in NEWS if n["id"] == news_id), None)
    if not item:
        raise HTTPException(404, "No news item with that id")
    key = (user["id"], news_id)
    if key in _summaries:
        return {"summary": _summaries[key], "source": "gemini"}
    if not settings.AI_ON:
        return {"summary": item["summary"], "source": "stored"}
    profile, actions, shocks, warnings, recurring = await state_for(user)
    fc = run_forecast(warnings, recurring, actions, shocks)
    page, how = await page_text.fetch_page_text(item["source_url"])
    try:
        text = await ai.summarise_page(item, page, user_facts(profile, warnings, fc))
    except Exception as e:
        await store.log_event(user, "news_summary", f"Couldn't summarise \"{item['title']}\", so it read out the short version instead.")
        return {"summary": item["summary"], "source": "stored"}
    if not text:
        return {"summary": item["summary"], "source": "stored"}
    _summaries[key] = text
    await store.log_event(user, "news_summary", (f"Read \"{item['title']}\" on {item['source_name']} and explained what it means for you." if page is not None else f"Couldn't open the {item['source_name']} page, so it explained \"{item['title']}\" from the short version."))
    return {"summary": text, "source": "gemini", "read_page": page is not None}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), user=Depends(current_user)):
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(503, "Voice isn't set up. Add ELEVENLABS_API_KEY to .env.")
    audio = await file.read(10 * 1024 * 1024 + 1)
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(413, "That recording is too long.")
    if len(audio) < 1000:
        raise HTTPException(422, "We didn't hear anything. Hold the button a bit longer.")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            "https://api.elevenlabs.io/v1/speech-to-text",
            headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
            data={"model_id": "scribe_v1", "language_code": "en"},
            files={"file": (file.filename or "voice.webm", audio, file.content_type or "audio/webm")},
        )
    if r.status_code != 200:
        raise HTTPException(502, "The voice service didn't answer. Try again or type it.")
    text = (r.json().get("text") or "").strip()
    await store.log_event(user, "voice_transcribe", f"Listened to you and heard: \"{text[:80]}\"")
    if not text:
        raise HTTPException(422, "We didn't hear anything. Try again or type it.")
    return {"text": text}


@app.get("/history")
async def history(user=Depends(current_user)):
    days = 60
    start = settings.TODAY - dt.timedelta(days=days)
    by_day: dict[str, float] = {}
    for t in TRANSACTIONS:
        by_day[t["date"]] = by_day.get(t["date"], 0) + t["amount_gbp"]
    bal = TX["account"]["balance_gbp"]
    out = []
    d = settings.TODAY - dt.timedelta(days=1)
    while d >= start:
        out.append({"date": d.isoformat(), "balance": round(bal, 2)})
        bal -= by_day.get(d.isoformat(), 0)
        d -= dt.timedelta(days=1)
    out.reverse()
    low = min(out, key=lambda p: p["balance"])
    return {"days": out, "lowest": low, "account": TX["account"]}


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=800)


@app.post("/speak")
async def speak(body: SpeakIn, user=Depends(current_user)):
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(503, "Voice isn't set up. Add ELEVENLABS_API_KEY to .env.")
    voice = settings.ELEVENLABS_VOICE_ID or ai_config.VOICE_ID
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
            headers={"xi-api-key": settings.ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json={"text": body.text, "model_id": ai_config.VOICE_MODEL},
        )
    if r.status_code != 200:
        raise HTTPException(502, "The voice service didn't answer. Try again.")
    return Response(content=r.content, media_type="audio/mpeg")


class HeardIn(BaseModel):
    text: str = Field(min_length=2, max_length=300)


@app.post("/whatif/parse")
async def whatif_parse(body: HeardIn, user=Depends(current_user)):
    today = settings.TODAY
    last = today + dt.timedelta(days=F.HORIZON_DAYS - 1)
    default = today + dt.timedelta(days=30)
    if not settings.AI_ON:
        raise HTTPException(503, "Voice what-if needs the AI. Add GEMINI_API_KEY to .env.")
    try:
        parsed = await ai.parse_whatif(body.text, today, last, default)
    except Exception as e:
        await store.log_event(user, "whatif_voice", f"Couldn't work out a cost from \"{body.text[:60]}\".")
        raise HTTPException(502, "We couldn't understand that. Try again or type it in.")
    try:
        d = dt.date.fromisoformat(parsed["date"])
    except ValueError:
        d = default
    parsed["date"] = min(max(d, today), last).isoformat()
    if parsed.get("amount_gbp") is not None and not (0 < parsed["amount_gbp"] <= 10000):
        parsed["amount_gbp"] = None
    await store.log_event(user, "whatif_voice", f"Turned \"{body.text[:80]}\" into a what-if: {parsed['label']}" + (f", £{parsed['amount_gbp']:g}" if parsed.get("amount_gbp") else "") + f" on {int(parsed['date'][8:])} {dt.date.fromisoformat(parsed['date']).strftime('%B')}.")
    return {**parsed, "heard": body.text}


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
