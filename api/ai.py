import json
from collections import defaultdict
from datetime import date
from statistics import mean
from typing import Literal, Optional

import anthropic
from pydantic import BaseModel

import ai_config
import settings

Confidence = Literal["high", "medium", "low"]


class StrGuess(BaseModel):
    value: Optional[str]
    reason: str
    transaction_ids: list[str]
    confidence: Confidence


class NumGuess(BaseModel):
    value: Optional[float]
    reason: str
    transaction_ids: list[str]
    confidence: Confidence


class IntGuess(BaseModel):
    value: Optional[int]
    reason: str
    transaction_ids: list[str]
    confidence: Confidence


class IntListGuess(BaseModel):
    value: list[int]
    reason: str
    transaction_ids: list[str]
    confidence: Confidence


class StrListGuess(BaseModel):
    value: list[str]
    reason: str
    transaction_ids: list[str]
    confidence: Confidence


class ProfileGuess(BaseModel):
    job_type: StrGuess
    contract_type: StrGuess
    pay_frequency: StrGuess
    pay_min_gbp: NumGuess
    pay_max_gbp: NumGuess
    adults: IntGuess
    children_ages: IntListGuess
    benefits: StrListGuess
    housing: StrGuess
    area: StrGuess
    energy_payment: StrGuess


def summarise(transactions):
    groups = defaultdict(list)
    for t in transactions:
        groups[t["merchant"]].append(t)
    rows = []
    for merchant, ts in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        amounts = [t["amount_gbp"] for t in ts]
        rows.append({
            "merchant": merchant,
            "category": ts[0]["category"],
            "count": len(ts),
            "first": ts[0]["date"],
            "last": ts[-1]["date"],
            "min_gbp": min(amounts),
            "max_gbp": max(amounts),
            "avg_gbp": round(mean(amounts), 2),
            "weekdays": sorted({date.fromisoformat(t["date"]).strftime("%a") for t in ts}),
            "months": sorted({t["date"][:7] for t in ts}),
            "example_ids": [t["id"] for t in ts[-6:]],
        })
    return rows


_client = None


def client():
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def guess_profile(transactions):
    summary = summarise(transactions)
    prompt = (
        "Form fields and allowed options:\n" + json.dumps(ai_config.FORM_OPTIONS, indent=1)
        + "\n\nTransactions grouped by merchant (amounts in GBP, negative is money out):\n" + json.dumps(summary, indent=1)
    )
    resp = await client().messages.parse(
        model=ai_config.MODEL,
        max_tokens=ai_config.MAX_TOKENS,
        system=ai_config.PROFILE_GUESS_SYSTEM,
        messages=[{"role": "user", "content": prompt}],
        output_format=ProfileGuess,
        output_config={"effort": ai_config.EFFORT},
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise RuntimeError(f"Claude did not return a guess (stop_reason={resp.stop_reason})")
    return resp.parsed_output.model_dump(), {"model": resp.model, "input_tokens": resp.usage.input_tokens, "output_tokens": resp.usage.output_tokens}


def rule_based_guess(transactions):
    by_cat = defaultdict(list)
    for t in transactions:
        by_cat[t["category"]].append(t)
    pay = sorted(by_cat["income"], key=lambda t: t["date"])
    amounts = sorted(t["amount_gbp"] for t in pay)
    pay_ids = [t["id"] for t in pay[-4:]]

    def ids(cat, n=3):
        return [t["id"] for t in sorted(by_cat[cat], key=lambda t: t["date"])[-n:]]

    def g(value, reason, tids, conf):
        return {"value": value, "reason": reason, "transaction_ids": tids, "confidence": conf}

    employer = pay[-1]["merchant"] if pay else None
    benefits = [b for b, m in (("Universal Credit", "DWP Universal Credit"), ("Child Benefit", "HMRC Child Benefit")) if any(t["merchant"] == m for t in transactions)]
    ben_ids = [t["id"] for t in transactions if t["merchant"] in ("DWP Universal Credit", "HMRC Child Benefit")][-2:]
    return {
        "job_type": g("Care worker" if employer and "care" in employer.lower() else None, f"Your pay comes from {employer}, a home care company.", pay_ids[:2], "medium"),
        "contract_type": g("Zero-hours", f"Your weekly pay changes a lot, from £{amounts[0]:.0f} to £{amounts[-1]:.0f}. That usually means hours change week to week.", pay_ids, "medium"),
        "pay_frequency": g("Weekly", f"{employer} pays you every Friday.", pay_ids, "high"),
        "pay_min_gbp": g(round(amounts[0]), "Your lowest weekly pay in the last 12 months.", [pay[[t["amount_gbp"] for t in pay].index(amounts[0])]["id"]], "high"),
        "pay_max_gbp": g(round(amounts[-1]), "Your highest weekly pay in the last 12 months.", [pay[[t["amount_gbp"] for t in pay].index(amounts[-1])]["id"]], "high"),
        "adults": g(1, "Only one person's wages are paid in. Child Benefit is paid to you.", ids("benefit", 2), "low"),
        "children_ages": g([], "You pay for school meals and an after-school club, so you have school-age children. Your bank can't tell their ages.", ids("school_meals") + ids("childcare", 1), "low"),
        "benefits": g(benefits, "DWP and HMRC pay into your account every month.", ben_ids, "high"),
        "housing": g("Private renting", "You pay £900 a month to Northside Lettings, a letting agent.", ids("rent"), "high"),
        "area": g("Manchester", "You pay council tax to Manchester City Council.", ids("council_tax"), "high"),
        "energy_payment": g("Direct debit", "Ember Energy takes the same amount on the 3rd of every month.", ids("energy"), "high"),
    }
