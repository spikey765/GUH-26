import math
from collections import defaultdict
from datetime import date, timedelta
from statistics import mean, median

HORIZON_DAYS = 60
TIGHT_GBP = 50.0
VARIABLE = {"groceries", "fuel", "takeaway", "shopping", "cash", "school_meals", "childcare", "christmas", "other"}
INCOME = {"income", "benefit"}


def d(s):
    return date.fromisoformat(s)


def gbp(x):
    return round(x, 2)


def percentile(values, p):
    v = sorted(values)
    if not v:
        return 0.0
    k = (len(v) - 1) * p
    lo, hi = math.floor(k), math.ceil(k)
    return v[lo] + (v[hi] - v[lo]) * (k - lo)


def detect_recurring(transactions, today):
    since = today - timedelta(days=100)
    groups = defaultdict(list)
    for t in transactions:
        if t["category"] in VARIABLE or d(t["date"]) < since:
            continue
        groups[t["merchant"]].append(t)
    items = []
    for merchant, ts in groups.items():
        if len(ts) < 3:
            continue
        ts.sort(key=lambda t: t["date"])
        dates = [d(t["date"]) for t in ts]
        gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
        g = median(gaps)
        if 6 <= g <= 8:
            freq = "weekly"
        elif 27 <= g <= 29 and max(gaps) - min(gaps) <= 1:
            freq = "four_weekly"
        elif 28 <= g <= 31:
            freq = "monthly"
        else:
            continue
        amounts = [t["amount_gbp"] for t in ts]
        varies = max(amounts) - min(amounts) > 5
        items.append({
            "merchant": merchant,
            "category": ts[-1]["category"],
            "frequency": freq,
            "last_date": dates[-1].isoformat(),
            "day_of_month": dates[-1].day,
            "amount": gbp(mean(amounts) if varies else amounts[-1]),
            "low": gbp(percentile(amounts, 0.2) if varies else amounts[-1]),
            "high": gbp(percentile(amounts, 0.8) if varies else amounts[-1]),
            "is_income": ts[-1]["category"] in INCOME,
            "transaction_ids": [t["id"] for t in ts[-4:]],
        })
    return sorted(items, key=lambda i: (not i["is_income"], i["merchant"]))


def occurrences(item, start, end):
    last = d(item["last_date"])
    out = []
    if item["frequency"] in ("weekly", "four_weekly"):
        step = 7 if item["frequency"] == "weekly" else 28
        x = last + timedelta(days=step)
        while x <= end:
            if x >= start:
                out.append(x)
            x += timedelta(days=step)
    else:
        y, m = last.year, last.month
        while True:
            m += 1
            if m > 12:
                y, m = y + 1, 1
            dom = min(item["day_of_month"], 28)
            x = date(y, m, dom)
            if x > end:
                break
            if x >= start:
                out.append(x)
    return out


def variable_daily(transactions, today, days=56):
    since = today - timedelta(days=days)
    spend = -sum(t["amount_gbp"] for t in transactions if t["category"] in VARIABLE and t["category"] != "christmas" and since <= d(t["date"]) < today)
    return spend / days


def school_age(profile):
    return [a for a in profile.get("children_ages") or [] if 4 <= a <= 16]


def has_category(transactions, cat):
    return any(t["category"] == cat for t in transactions)


def applies(event, profile, transactions):
    cond = event.get("applies_if", {})
    if cond.get("school_age_children") and not school_age(profile) and not has_category(transactions, "school_meals"):
        return False
    if "transaction_category" in cond and not has_category(transactions, cond["transaction_category"]):
        return False
    if "energy_payment" in cond and (profile.get("energy_payment") or "").lower() != cond["energy_payment"].lower():
        return False
    if "benefit" in cond and cond["benefit"] not in (profile.get("benefits") or []):
        return False
    return True


def matched_transactions(event, transactions, limit=5):
    cat = event.get("applies_if", {}).get("transaction_category") or event.get("applies_to")
    if not cat:
        return []
    ts = [t for t in transactions if t["category"] == cat]
    ts.sort(key=lambda t: t["date"], reverse=True)
    return ts[:limit]


def weekdays_between(a, b):
    n, x = [], a
    while x <= b:
        if x.weekday() < 5:
            n.append(x)
        x += timedelta(days=1)
    return n


def bill_for(recurring, category):
    for r in recurring:
        if r["category"] == category:
            return r
    return None


def event_cost(event, profile, transactions, recurring, events_by_cat):
    per = event.get("per")
    eff = d(event["effective_date"])
    if event["change_type"] == "percent":
        bill = bill_for(recurring, event.get("applies_to"))
        if not bill:
            return None
        base = abs(bill["amount"])
        for other in events_by_cat.get(event.get("applies_to"), []):
            if other["change_type"] == "percent" and d(other["effective_date"]) < eff:
                base *= 1 + other["change_value"] / 100
        monthly = base * event["change_value"] / 100
        if bill["frequency"] == "weekly":
            monthly *= 52 / 12
        sign = 1 if bill["is_income"] else -1
        return {"kind": "monthly", "monthly_gbp": gbp(monthly), "direction": "up" if sign > 0 else "cost", "bill": bill, "per_payment": gbp(base * event["change_value"] / 100)}
    if per == "child_per_weekday":
        known = len(school_age(profile))
        kids = known or 1
        days = weekdays_between(eff, d(event["end_date"]))
        total = kids * event["change_value"] * len(days)
        if known:
            detail = f"{kids} {'child' if kids == 1 else 'children'} x £{event['change_value']:.0f} x {len(days)} days"
        else:
            detail = f"£{event['change_value']:.0f} x {len(days)} days for each child. Add your children's ages in About you for your total."
        return {"kind": "spread", "total_gbp": gbp(total), "days": [x.isoformat() for x in days], "direction": "cost", "detail": detail, "per_child": not known}
    if per == "from_last_year":
        cat = event["estimate_category"]
        last_year = [t for t in transactions if t["category"] == cat]
        total = -sum(t["amount_gbp"] for t in last_year)
        end = d(event["end_date"])
        days = [(eff + timedelta(days=i)).isoformat() for i in range((end - eff).days + 1)]
        return {"kind": "spread", "total_gbp": gbp(total), "days": days, "direction": "cost", "detail": f"Same as last year: {len(last_year)} payments"}
    if per == "month":
        return {"kind": "monthly_fixed", "monthly_gbp": gbp(event["change_value"]), "direction": "cost"}
    if per == "once":
        return {"kind": "once", "total_gbp": gbp(event["change_value"]), "direction": "cost"}
    return None


def weeks_until(today, target):
    return max(1, math.floor((target - today).days / 7))


def suggestion_for(event, cost, today):
    s = dict(event["suggestion"])
    eff = d(event["effective_date"])
    if s["type"] == "weekly_save" and cost:
        if cost["kind"] in ("monthly", "monthly_fixed"):
            target = cost["monthly_gbp"] * s.get("months", 3)
        else:
            target = cost.get("total_gbp", 0)
        weeks = weeks_until(today, eff)
        s["weekly_gbp"] = math.ceil(target / weeks)
        s["weeks"] = weeks
        s["target_gbp"] = gbp(target)
        s["title"] = f"Put £{s['weekly_gbp']} a week aside"
    if s["type"] == "free_help" and s.get("covers") and cost and cost.get("total_gbp"):
        s["saves_gbp"] = gbp(cost["total_gbp"] * s["covers"])
    if s["type"] == "free_help" and s.get("credit_gbp"):
        s["saves_gbp"] = s["credit_gbp"]
    return s


def headline(event, cost):
    if not cost:
        return ""
    if cost["kind"] == "monthly":
        word = "more a month for you" if cost["direction"] == "cost" else "a month more for you"
        return f"£{cost['monthly_gbp']:.0f} {word}"
    if cost["kind"] == "monthly_fixed":
        return f"£{cost['monthly_gbp']:.2f} more a month"
    if cost.get("per_child"):
        return f"About £{cost['total_gbp']:.0f} extra for each child"
    return f"About £{cost['total_gbp']:.0f} extra"


def build_warnings(profile, transactions, events, today, actions):
    recurring = detect_recurring(transactions, today)
    by_cat = defaultdict(list)
    for e in events:
        if applies(e, profile, transactions) and e.get("applies_to"):
            by_cat[e["applies_to"]].append(e)
    end = today + timedelta(days=HORIZON_DAYS - 1)
    out = []
    for e in events:
        if not applies(e, profile, transactions):
            continue
        cost = event_cost(e, profile, transactions, recurring, by_cat)
        eff = d(e["effective_date"])
        out.append({
            "id": e["id"],
            "title": e["title"],
            "category": e["category"],
            "effective_date": e["effective_date"],
            "end_date": e.get("end_date"),
            "label": e["label"],
            "source_name": e["source_name"],
            "source_url": e.get("source_url"),
            "explain": e["explain"],
            "headline": headline(e, cost),
            "cost": {k: v for k, v in (cost or {}).items() if k != "bill"},
            "good_news": bool(cost and cost["direction"] == "up"),
            "history": e.get("history", []),
            "matched_transactions": matched_transactions(e, transactions),
            "suggestion": suggestion_for(e, cost, today),
            "in_window": eff <= end,
            "days_away": (eff - today).days,
            "confirmed": actions.get(e["id"], {}).get("confirmed", False),
            "_cost": cost,
        })
    out.sort(key=lambda w: (not w["in_window"], w["effective_date"]))
    return out, recurring


def project(balance, recurring, transactions, warnings, today, actions, shocks=()):
    end = today + timedelta(days=HORIZON_DAYS - 1)
    days = [today + timedelta(days=i) for i in range(HORIZON_DAYS)]
    flows = {x: {"mid": 0.0, "low": 0.0, "high": 0.0, "items": []} for x in days}

    def put(x, mid, low=None, high=None, label=None):
        if x not in flows:
            return
        f = flows[x]
        f["mid"] += mid
        f["low"] += mid if low is None else low
        f["high"] += mid if high is None else high
        if label:
            f["items"].append({"label": label, "gbp": gbp(mid)})

    pct_events = defaultdict(list)
    for w in warnings:
        c = w["_cost"]
        if c and c["kind"] == "monthly" and w["in_window"]:
            pct_events[c["bill"]["category"]].append(w)

    for r in recurring:
        for x in occurrences(r, today, end):
            amt, lo, hi = r["amount"], r["low"], r["high"]
            for w in pct_events.get(r["category"], []):
                if x >= d(w["effective_date"]):
                    step = math.copysign(w["_cost"]["per_payment"], amt)
                    amt, lo, hi = amt + step, lo + step, hi + step
            if r["is_income"]:
                put(x, amt, lo, hi, r["merchant"])
            else:
                put(x, amt, amt, amt, r["merchant"])

    daily = variable_daily(transactions, today)
    for x in days:
        put(x, -daily, -daily * 1.1, -daily * 0.92)

    for w in warnings:
        c = w["_cost"]
        if not c or not w["in_window"]:
            continue
        act = actions.get(w["id"], {})
        covered = 0.0
        if act.get("confirmed") and w["suggestion"].get("covers"):
            covered = w["suggestion"]["covers"]
        if c["kind"] == "spread":
            per_day = c["total_gbp"] * (1 - covered) / len(c["days"])
            for s in c["days"]:
                put(d(s), -per_day, -per_day, -per_day, w["title"] if s == c["days"][0] else None)
        elif c["kind"] == "once":
            put(d(w["effective_date"]), -c["total_gbp"], label=w["title"])
        elif c["kind"] == "monthly_fixed":
            x = d(w["effective_date"])
            while x <= end:
                put(x, -c["monthly_gbp"], label=w["title"])
                x = date(x.year + (x.month == 12), x.month % 12 + 1, x.day)

    for w in warnings:
        act = actions.get(w["id"], {})
        if not act.get("confirmed"):
            continue
        s = w["suggestion"]
        if s.get("type") == "weekly_save" and s.get("weekly_gbp"):
            stop = min(d(w["effective_date"]), end)
            per_day = s["weekly_gbp"] / 7
            x = today
            while x < stop:
                put(x, per_day)
                x += timedelta(days=1)
        if s.get("credit_gbp") and s.get("credit_date"):
            put(d(s["credit_date"]), s["credit_gbp"], label=s["title"])

    for sh in shocks:
        put(d(sh["date"]), -sh["amount_gbp"], label=f"What if: {sh['label']}")
        if sh.get("weekly_gbp"):
            weeks = (d(sh["date"]) - today).days // 7
            x = today
            while x < min(today + timedelta(days=weeks * 7), end):
                put(x, sh["weekly_gbp"] / 7)
                x += timedelta(days=1)

    series, mid, low, high = [], balance, balance, balance
    for x in days:
        f = flows[x]
        mid += f["mid"]
        low += f["low"]
        high += f["high"]
        series.append({"date": x.isoformat(), "balance": gbp(mid), "low": gbp(min(low, mid)), "high": gbp(max(high, mid)), "items": f["items"]})
    worst = min(series, key=lambda p: p["balance"])
    tight_weeks = []
    for i in range(0, HORIZON_DAYS, 7):
        chunk = series[i:i + 7]
        m = min(chunk, key=lambda p: p["balance"])
        if m["balance"] < TIGHT_GBP:
            tight_weeks.append({"start": chunk[0]["date"], "end": chunk[-1]["date"], "lowest_gbp": m["balance"]})
    return {
        "today": today.isoformat(),
        "start_balance": gbp(balance),
        "tight_threshold_gbp": TIGHT_GBP,
        "days": series,
        "worst_day": {"date": worst["date"], "balance": worst["balance"]},
        "tight_weeks": tight_weeks,
        "daily_spend_gbp": gbp(daily),
    }


def balance_on(forecast, day):
    iso = day.isoformat()
    return next((p["balance"] for p in forecast["days"] if p["date"] == iso), None)


def lowest_from(forecast, day):
    iso = day.isoformat()
    after = [p for p in forecast["days"] if p["date"] >= iso]
    p = min(after, key=lambda p: p["balance"])
    return {"date": p["date"], "balance": p["balance"]}


def saving_plan(amount, today, shock_date):
    days = (shock_date - today).days
    weeks = days // 7
    if weeks < 1:
        return {"weekly_gbp": 0, "weeks": 0, "total_gbp": 0, "too_soon": True}
    weekly = math.ceil(amount / weeks)
    return {"weekly_gbp": weekly, "weeks": weeks, "total_gbp": weekly * weeks, "too_soon": False}
