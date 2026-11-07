import json
import random
from datetime import date, timedelta
from pathlib import Path

DATA = Path(__file__).parent / "data"
TODAY = date(2026, 11, 7)
START = date(2025, 11, 7)
END = TODAY - timedelta(days=1)
CLOSING_BALANCE = 260.0

rng = random.Random(2026)

SCHOOL_HOLIDAYS = [
    (date(2025, 12, 19), date(2026, 1, 5)),
    (date(2026, 2, 14), date(2026, 2, 22)),
    (date(2026, 3, 28), date(2026, 4, 12)),
    (date(2026, 5, 23), date(2026, 5, 31)),
    (date(2026, 7, 22), date(2026, 9, 2)),
    (date(2026, 10, 24), date(2026, 11, 1)),
]


def in_holiday(d):
    return any(a <= d <= b for a, b in SCHOOL_HOLIDAYS)


def days():
    d = START
    while d <= END:
        yield d
        d += timedelta(days=1)


def energy_dd(d):
    if date(2025, 12, 1) <= d < date(2026, 4, 1):
        return 112.0
    if d < date(2025, 12, 1):
        return 84.0
    if d < date(2026, 11, 1):
        return 86.0
    return 88.0


def make_transactions():
    tx = []

    def add(d, merchant, amount, category):
        tx.append({"date": d.isoformat(), "merchant": merchant, "amount_gbp": round(amount, 2), "category": category})

    child_benefit_day = date(2025, 11, 10)
    for d in days():
        if d.weekday() == 4:
            pay = rng.triangular(180, 330, 190) if in_holiday(d) else rng.triangular(180, 420, 240)
            add(d, "Brightcare Homecare Ltd", round(pay * 2) / 2, "income")
        if d.day == 14:
            add(d, "DWP Universal Credit", 812.0 - rng.randint(0, 40), "benefit")
        if (d - child_benefit_day).days % 28 == 0 and d >= child_benefit_day:
            add(d, "HMRC Child Benefit", 173.20, "benefit")
        if d.day == 28:
            add(d, "Northside Lettings", -900.0, "rent")
        if d.day == 3:
            add(d, "Ember Energy", -energy_dd(d), "energy")
        if d.day == 6:
            add(d, "United Utilities", -38.0 if d < date(2026, 4, 1) else -40.6, "water")
        if d.day == 15 and d.month not in (2, 3):
            add(d, "Manchester City Council", -118.0 if d < date(2026, 4, 1) else -123.9, "council_tax")
        if d.day == 20:
            add(d, "Tellmo Mobile", -15.0 if d < date(2026, 4, 1) else -16.5, "mobile")
        if d.day == 22:
            add(d, "Fibrewave Broadband", -27.0, "broadband")
        if d.weekday() == 0 and not in_holiday(d):
            add(d, "ParentPay school meals", -rng.choice([6.0, 7.5, 9.0]), "school_meals")
            add(d, "Kidzone after-school club", -30.0, "childcare")
        if d.weekday() in (1, 5):
            base = rng.uniform(46, 60)
            if in_holiday(d):
                base += rng.uniform(18, 26)
            add(d, rng.choice(["Aldi", "Lidl", "Aldi", "Tesco"]), -base, "groceries")
        if d.weekday() == 3:
            add(d, rng.choice(["Esso", "Shell"]), -rng.uniform(20, 32), "fuel")
        if d.weekday() == 6 and rng.random() < 0.3:
            add(d, rng.choice(["Domino's", "Just Eat"]), -rng.uniform(14, 22), "takeaway")
        if rng.random() < 0.05:
            add(d, "Cash machine", -20.0, "cash")
        if d.weekday() == 2 and rng.random() < 0.5:
            add(d, rng.choice(["Home Bargains", "B&M", "Primark"]), -rng.uniform(8, 25), "shopping")

    add(date(2026, 3, 12), "Shield Car Insurance", -548.0, "car_insurance")
    for d, merchant, amt in [
        (date(2025, 12, 6), "Smyths Toys", 64.0),
        (date(2025, 12, 13), "Argos", 85.0),
        (date(2025, 12, 18), "Smyths Toys", 42.0),
        (date(2025, 12, 20), "Tesco", 96.0),
        (date(2025, 12, 23), "Aldi", 58.0),
        (date(2025, 12, 23), "Primark", 45.0),
    ]:
        add(d, merchant, -amt, "christmas" if merchant != "Tesco" and merchant != "Aldi" else "groceries")

    tx.sort(key=lambda t: (t["date"], t["merchant"]))
    for i, t in enumerate(tx, 1):
        t["id"] = f"t{i:04d}"
    return {
        "account": {"name": "Everyday account", "balance_gbp": CLOSING_BALANCE, "as_of": TODAY.isoformat()},
        "transactions": [{k: t[k] for k in ("id", "date", "merchant", "amount_gbp", "category")} for t in tx],
    }


PROFILE = {
    "job_type": "Care worker",
    "contract_type": "Zero-hours",
    "pay_frequency": "Weekly",
    "pay_min_gbp": 180,
    "pay_max_gbp": 420,
    "adults": 1,
    "children_ages": [7, 11],
    "benefits": ["Universal Credit", "Child Benefit"],
    "housing": "Private renting",
    "area": "Manchester",
    "energy_payment": "Direct debit",
}

EVENTS = [
    {
        "id": "school-christmas",
        "title": "School's out for Christmas",
        "category": "food",
        "effective_date": "2026-12-19",
        "end_date": "2027-01-04",
        "change_type": "fixed",
        "change_value": 4.0,
        "per": "child_per_weekday",
        "label": "confirmed",
        "source_name": "Manchester City Council school term dates",
        "source_url": "https://www.manchester.gov.uk/info/500229/school_term_dates",
        "explain": "Free school meals stop for 11 school days. Lunch at home for two children costs about £4 each a day.",
        "history": [{"date": "2025-12-19", "change": "Your food shopping went up about £45 a week over last Christmas"}],
        "applies_if": {"school_age_children": True, "transaction_category": "school_meals"},
        "suggestion": {
            "type": "free_help",
            "title": "Sign up for free holiday meals",
            "text": "Manchester's holiday activities and food clubs are free for children on free school meals. They give a hot lunch on most weekdays.",
            "covers": 0.7,
            "link": "https://www.manchester.gov.uk/haf",
        },
    },
    {
        "id": "christmas-costs",
        "title": "Christmas presents and food",
        "category": "christmas",
        "effective_date": "2026-12-12",
        "end_date": "2026-12-24",
        "change_type": "fixed",
        "change_value": 0,
        "per": "from_last_year",
        "estimate_category": "christmas",
        "label": "likely",
        "source_name": "Your spending last December",
        "source_url": None,
        "explain": "Last December you spent extra on presents at Smyths Toys, Argos and Primark.",
        "history": [{"date": "2025-12-06", "change": "£236 on presents between 6 and 23 December 2025"}],
        "applies_if": {"transaction_category": "christmas"},
        "suggestion": {
            "type": "weekly_save",
            "title": "Put a little aside each week",
            "text": "Keep a small amount back from each pay day until mid-December.",
        },
    },
    {
        "id": "winter-energy",
        "title": "Winter energy direct debit",
        "category": "energy",
        "effective_date": "2026-12-01",
        "change_type": "percent",
        "change_value": 27.0,
        "per": "bill",
        "applies_to": "energy",
        "label": "likely",
        "source_name": "Your Ember Energy payments last winter",
        "source_url": None,
        "explain": "Last year Ember Energy raised your direct debit from £84 to £112 in December. It went back down in April.",
        "history": [{"date": "2025-12-03", "change": "+£28 a month"}, {"date": "2026-04-03", "change": "-£26 a month"}],
        "applies_if": {"energy_payment": "Direct debit", "transaction_category": "energy"},
        "suggestion": {
            "type": "free_help",
            "title": "Check your Warm Home Discount",
            "text": "Households on Universal Credit in England get £150 off their winter electricity bill. It is usually automatic. Check it has been applied.",
            "credit_gbp": 150,
            "credit_date": "2026-12-03",
            "link": "https://www.gov.uk/the-warm-home-discount-scheme",
        },
    },
    {
        "id": "energy-cap-jan",
        "title": "Energy price change in January",
        "category": "energy",
        "effective_date": "2027-01-01",
        "change_type": "percent",
        "change_value": 5.4,
        "per": "bill",
        "applies_to": "energy",
        "label": "forecast",
        "source_name": "Cornwall Insight price cap forecast",
        "source_url": "https://www.cornwall-insight.com/",
        "explain": "The energy price cap is forecast to rise from 1 January. Ofgem confirms it in late November.",
        "history": [
            {"date": "2025-10-01", "change": "+2%"},
            {"date": "2026-01-01", "change": "+0.2%"},
            {"date": "2026-04-01", "change": "-7%"},
            {"date": "2026-10-01", "change": "+1.5%"},
        ],
        "applies_if": {"transaction_category": "energy"},
        "suggestion": {
            "type": "weekly_save",
            "title": "Put a little aside each week",
            "text": "A small amount each week from now covers the higher bill.",
            "months": 3,
        },
    },
    {
        "id": "council-tax-april",
        "title": "Council tax goes up in April",
        "category": "council_tax",
        "effective_date": "2027-04-01",
        "change_type": "percent",
        "change_value": 4.99,
        "per": "bill",
        "applies_to": "council_tax",
        "label": "likely",
        "source_name": "Manchester City Council budget",
        "source_url": "https://www.manchester.gov.uk/councilbudget",
        "explain": "Councils can raise council tax by up to 4.99% a year without a local vote. Manchester has done this for three years.",
        "history": [{"date": "2024-04-01", "change": "+4.99%"}, {"date": "2025-04-01", "change": "+4.99%"}, {"date": "2026-04-01", "change": "+4.99%"}],
        "applies_if": {"transaction_category": "council_tax"},
        "suggestion": {
            "type": "free_help",
            "title": "Check Council Tax Support",
            "text": "People on Universal Credit in Manchester can get up to 82.5% off council tax. Apply on the council website.",
            "link": "https://www.manchester.gov.uk/ctsupport",
        },
    },
    {
        "id": "water-april",
        "title": "Water bills go up in April",
        "category": "water",
        "effective_date": "2027-04-01",
        "change_type": "percent",
        "change_value": 6.0,
        "per": "bill",
        "applies_to": "water",
        "label": "forecast",
        "source_name": "Ofwat price review 2024",
        "source_url": "https://www.ofwat.gov.uk/regulated-companies/price-review/2024-price-review/",
        "explain": "Ofwat set water bills to rise every April until 2030.",
        "history": [{"date": "2025-04-01", "change": "+26%"}, {"date": "2026-04-01", "change": "+7%"}],
        "applies_if": {"transaction_category": "water"},
        "suggestion": {
            "type": "free_help",
            "title": "Ask about a cheaper water tariff",
            "text": "United Utilities has a lower tariff for people on low incomes. You can apply online or by phone.",
            "link": "https://www.unitedutilities.com/help-and-support/your-account/financial-help/",
        },
    },
    {
        "id": "mobile-april",
        "title": "Mobile bill rises in April",
        "category": "mobile",
        "effective_date": "2027-04-01",
        "change_type": "fixed",
        "change_value": 1.5,
        "per": "month",
        "label": "confirmed",
        "source_name": "Tellmo Mobile contract terms",
        "source_url": "https://www.ofcom.org.uk/phones-and-broadband/bills-and-charges/price-rises",
        "explain": "Your contract says the price goes up £1.50 a month every April.",
        "history": [{"date": "2026-04-01", "change": "+£1.50 a month"}],
        "applies_if": {"transaction_category": "mobile"},
        "suggestion": {
            "type": "free_help",
            "title": "Look at social tariffs",
            "text": "Ofcom lists cheaper mobile and broadband deals for people on Universal Credit.",
            "link": "https://www.ofcom.org.uk/phones-and-broadband/saving-money/social-tariffs",
        },
    },
    {
        "id": "car-insurance",
        "title": "Car insurance renewal",
        "category": "car_insurance",
        "effective_date": "2027-03-12",
        "change_type": "fixed",
        "change_value": 548.0,
        "per": "once",
        "label": "likely",
        "source_name": "Your Shield Car Insurance payment last March",
        "source_url": None,
        "explain": "You paid Shield Car Insurance £548 on 12 March 2026. It renews once a year.",
        "history": [{"date": "2026-03-12", "change": "£548 paid in one go"}],
        "applies_if": {"transaction_category": "car_insurance"},
        "suggestion": {
            "type": "weekly_save",
            "title": "Start a renewal pot",
            "text": "A small amount each week means the renewal is covered in March.",
        },
    },
    {
        "id": "uc-april",
        "title": "Universal Credit goes up in April",
        "category": "benefit",
        "effective_date": "2027-04-06",
        "change_type": "percent",
        "change_value": 3.8,
        "per": "bill",
        "applies_to": "benefit",
        "label": "confirmed",
        "source_name": "DWP benefit uprating",
        "source_url": "https://www.gov.uk/government/collections/benefit-and-pension-rates",
        "explain": "Benefits go up each April in line with prices from the September before.",
        "history": [{"date": "2025-04-07", "change": "+1.7%"}, {"date": "2026-04-06", "change": "+3.8%"}],
        "applies_if": {"benefit": "Universal Credit"},
        "suggestion": {"type": "info", "title": "Good news", "text": "Nothing to do. This is paid automatically."},
    },
    {
        "id": "prepay-standing",
        "title": "Prepayment meter standing charge change",
        "category": "energy",
        "effective_date": "2027-01-01",
        "change_type": "fixed",
        "change_value": 3.0,
        "per": "month",
        "label": "forecast",
        "source_name": "Ofgem",
        "source_url": "https://www.ofgem.gov.uk/energy-price-cap",
        "explain": "Standing charges for prepayment meters are changing.",
        "history": [],
        "applies_if": {"energy_payment": "Prepayment meter"},
        "suggestion": {"type": "info", "title": "Top up a little extra", "text": "Add a little more each week."},
    },
]

COUNCIL_TAX = {
    "area": "Manchester",
    "band": "A",
    "year": "2026/27",
    "discount": "25% single person discount",
    "parts": [
        {"name": "Manchester City Council", "amount_2025": 1012.40, "amount_2026": 1053.80, "pays_for": "Bins, roads, libraries, parks, children's services and housing help."},
        {"name": "Adult social care", "amount_2025": 168.20, "amount_2026": 177.10, "pays_for": "Care at home and in care homes for older and disabled people. This part can only be spent on care."},
        {"name": "Mayor's police", "amount_2025": 188.20, "amount_2026": 197.40, "pays_for": "Greater Manchester Police officers and staff."},
        {"name": "Mayor's fire and general", "amount_2025": 75.30, "amount_2026": 79.60, "pays_for": "Fire and rescue, plus mayoral projects like buses."},
    ],
    "history": [
        {"year": "2024/25", "rise_percent": 4.99},
        {"year": "2025/26", "rise_percent": 4.99},
        {"year": "2026/27", "rise_percent": 4.99},
    ],
    "next_april_rise_percent": 4.99,
    "source_name": "Manchester City Council council tax charges",
    "source_url": "https://www.manchester.gov.uk/info/200006/council_tax",
}


def main():
    DATA.mkdir(exist_ok=True)
    tx = make_transactions()
    files = {"profile.json": PROFILE, "transactions.json": tx, "events.json": EVENTS, "council_tax.json": COUNCIL_TAX}
    for name, payload in files.items():
        (DATA / name).write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(tx['transactions'])} transactions, {len(EVENTS)} events to {DATA}")


if __name__ == "__main__":
    main()
