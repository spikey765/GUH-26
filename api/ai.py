import asyncio
import base64
import json
import re
from collections import defaultdict
from datetime import date
from typing import Literal, Optional

from google import genai
from pydantic import BaseModel

import ai_config
import settings
import statement

Confidence = Literal["high", "medium", "low"]


class Evidence(BaseModel):
    date: str
    description: str
    amount_gbp: float


class StrGuess(BaseModel):
    value: Optional[str]
    confidence: Confidence
    reason: str
    evidence: list[Evidence]


class NumGuess(BaseModel):
    value: Optional[float]
    confidence: Confidence
    reason: str
    evidence: list[Evidence]


class StrListGuess(BaseModel):
    value: list[str]
    confidence: Confidence
    reason: str
    evidence: list[Evidence]


class ProfileGuess(BaseModel):
    job_type: StrGuess
    contract_type: StrGuess
    pay_frequency: StrGuess
    pay_min_gbp: NumGuess
    pay_max_gbp: NumGuess
    benefits: StrListGuess
    housing: StrGuess
    area: StrGuess
    energy_payment: StrGuess


FIELDS = list(ProfileGuess.model_fields)
LIST_FIELDS = {"benefits"}

def client():
    return genai.Client(api_key=settings.GEMINI_API_KEY)


def account_prompt(transactions):
    rows = [{"date": t["date"], "description": t["merchant"], "amount_gbp": t["amount_gbp"]} for t in transactions]
    return "Bank transactions (negative is money out):\n" + json.dumps(rows)


async def ask_gemini(pdf_bytes: bytes | None, transactions: list[dict]) -> dict:
    fields = "Form fields and allowed options:\n" + json.dumps(ai_config.FORM_OPTIONS, indent=1)
    if pdf_bytes is not None:
        parts = [
            {"type": "document", "data": base64.b64encode(pdf_bytes).decode("utf-8"), "mime_type": "application/pdf"},
            {"type": "text", "text": ai_config.PROFILE_GUESS_PROMPT + "\n\n" + fields + "\n\nThe statement is attached."},
        ]
    else:
        parts = [{"type": "text", "text": ai_config.PROFILE_GUESS_PROMPT + "\n\n" + fields + "\n\n" + account_prompt(transactions)}]
    gemini = client()
    interaction = await asyncio.wait_for(
        gemini.aio.interactions.create(
            model=ai_config.MODEL,
            input=parts,
            generation_config={"thinking_level": ai_config.THINKING_LEVEL},
            response_format={"type": "text", "mime_type": "application/json", "schema": ProfileGuess.model_json_schema()},
        ),
        timeout=ai_config.TIMEOUT_SECONDS,
    )
    return ProfileGuess.model_validate_json(interaction.output_text).model_dump()


def match_option(value, options):
    if not isinstance(value, str):
        return None
    squash = lambda s: re.sub(r"[^a-z]", "", s.lower())
    v = squash(value)
    exact = next((o for o in options if squash(o) == v), None)
    if exact:
        return exact
    inside = [o for o in options if squash(o) in v]
    return inside[0] if len(inside) == 1 else None


def empty_value(field):
    return [] if field in LIST_FIELDS else None


def apply_guardrails(raw: dict, verify) -> tuple[dict, int]:
    out, dropped = {}, 0
    for field in FIELDS:
        g = raw.get(field) or {}
        options = ai_config.FORM_OPTIONS[field]
        value = g.get("value")
        if isinstance(options, list):
            if field in LIST_FIELDS:
                value = [o for o in (match_option(v, options) for v in (value or [])) if o]
            else:
                value = match_option(value, options)
        kept = []
        for item in g.get("evidence") or []:
            ok = verify(item)
            if ok:
                kept.append(ok)
            else:
                dropped += 1
        empty = value is None or (isinstance(value, list) and not value)
        if not kept:
            value = empty_value(field)
            reason = "We couldn't find this on your statement. Please fill it in."
            confidence = "low"
        else:
            reason = (g.get("reason") or "").strip()
            confidence = g.get("confidence") if g.get("confidence") in ("high", "medium", "low") else "low"
            if empty:
                confidence = "low"
        out[field] = {"value": value, "confidence": confidence, "reason": reason, "evidence": kept[:5]}
    return out, dropped


def fix_pay_range(guesses: dict, lines: list[dict]) -> None:
    cited = guesses["pay_min_gbp"]["evidence"] + guesses["pay_max_gbp"]["evidence"] + guesses["pay_frequency"]["evidence"]
    cited = [e for e in cited if e["amount_gbp"] > 0]
    if not cited:
        return
    key = statement.tokens(cited[0]["description"])
    pay = [t for t in lines if t["amount_gbp"] > 0 and len(key & statement.tokens(t["description"])) >= min(2, len(key))]
    if len(pay) < 2:
        return
    low = min(pay, key=lambda t: t["amount_gbp"])
    high = max(pay, key=lambda t: t["amount_gbp"])
    line = lambda t: {"date": t["date"], "description": t["description"], "amount_gbp": t["amount_gbp"]}
    guesses["pay_min_gbp"] = {"value": low["amount_gbp"], "confidence": "high", "reason": f"Your lowest weekly pay out of {len(pay)} pay days.", "evidence": [line(low)]}
    guesses["pay_max_gbp"] = {"value": high["amount_gbp"], "confidence": "high", "reason": f"Your highest weekly pay out of {len(pay)} pay days.", "evidence": [line(high)]}


def rule_based_guess(transactions: list[dict]) -> dict:
    by_cat = defaultdict(list)
    for t in sorted(transactions, key=lambda t: t["date"]):
        by_cat[t["category"]].append(t)

    def ev(ts, n=3):
        return [{"date": t["date"], "description": t.get("description") or t["merchant"], "amount_gbp": t["amount_gbp"]} for t in ts[-n:]]

    def g(value, confidence, reason, evidence):
        return {"value": value, "confidence": confidence, "reason": reason, "evidence": evidence}

    pay = by_cat["income"]
    amounts = sorted(t["amount_gbp"] for t in pay)
    employer = pay[-1]["merchant"] if pay else ""
    gaps = sorted((date.fromisoformat(b["date"]) - date.fromisoformat(a["date"])).days for a, b in zip(pay, pay[1:]))
    weekly = len(gaps) >= 2 and 6 <= gaps[len(gaps) // 2] <= 8
    benefits = by_cat["benefit"]
    uc = [t for t in benefits if "universal" in (t.get("description") or t["merchant"]).lower()]
    chb = [t for t in benefits if "child benefit" in (t.get("description") or t["merchant"]).lower()]
    out = {
        "job_type": g("Care worker" if "care" in employer.lower() else None, "medium", f"Your wages come from {employer}, a home care company.", ev(pay, 2)),
        "contract_type": g("Zero-hours" if amounts and amounts[-1] - amounts[0] > 100 else None, "medium",
                           f"Your pay changes a lot each week, from £{amounts[0]:.0f} to £{amounts[-1]:.0f}. That usually means your hours change." if amounts else "", ev(pay, 4)),
        "pay_frequency": g("Weekly" if weekly else None, "high", f"{employer} pays you every week.", ev(pay, 4)),
        "pay_min_gbp": g(round(amounts[0]) if amounts else None, "high", "Your lowest weekly pay on the statement.", ev([t for t in pay if t["amount_gbp"] == amounts[0]][:1], 1) if amounts else []),
        "pay_max_gbp": g(round(amounts[-1]) if amounts else None, "high", "Your highest weekly pay on the statement.", ev([t for t in pay if t["amount_gbp"] == amounts[-1]][:1], 1) if amounts else []),
        "benefits": g([b for b, ts in (("Universal Credit", uc), ("Child Benefit", chb)) if ts], "high", "The DWP and HMRC pay money into your account.", ev(uc, 1) + ev(chb, 1)),
        "housing": g("Private renting" if by_cat["rent"] else None, "high", "You pay rent to a letting agent every month.", ev(by_cat["rent"], 2)),
        "area": g("Manchester" if any("manchester" in (t.get("description") or t["merchant"]).lower() for t in by_cat["council_tax"]) else None, "high", "You pay council tax to Manchester City Council.", ev(by_cat["council_tax"], 2)),
        "energy_payment": g("Direct debit" if by_cat["energy"] else None, "high", "Your energy company takes the same amount each month by direct debit.", ev(by_cat["energy"], 2)),
    }
    return out
