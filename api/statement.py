import io
import re
from datetime import date, datetime

from pypdf import PdfReader

TYPES = {"AUTOMATED CREDIT", "DEBIT CARD", "CASH WITHDRAWAL", "DIRECT DEBIT", "STANDING ORDER", "FASTER PAYMENT", "BANK TRANSFER", "BILL PAYMENT", "CREDIT"}
DATE_LINE = re.compile(r"^(\d{1,2} [A-Za-z]{3} \d{4})$")
MONEY_LINE = re.compile(r"^-?\D?[\d,]+\.\d{2}$")
CARD_PREFIX = re.compile(r"^\d{4} \d{2}[A-Z]{3}\d{2}(?: CD)? , ")
STOP = {"the", "and", "ltd", "limited", "plc", "gb", "uk", "ref", "payment", "card", "debit", "credit", "direct", "transaction", "automated", "standing", "order", "manchester"}


class NotAStatement(ValueError):
    pass


def extract_text(pdf_bytes: bytes) -> str:
    if not pdf_bytes.startswith(b"%PDF"):
        raise NotAStatement("That file isn't a PDF.")
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as e:
        raise NotAStatement("We couldn't read that PDF.") from e


def money(s: str) -> float:
    return float(re.sub(r"[^\d.\-]", "", s))


def clean_description(parts: list[str]) -> str:
    text = " ".join(p for p in parts if p != "TRANSACTION")
    text = CARD_PREFIX.sub("", text)
    text = re.sub(r"\s+", " ", text).strip(" ,")
    return text


def parse_transactions(text: str) -> list[dict]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    balance = None
    for i, l in enumerate(lines):
        if l == "BROUGHT FORWARD":
            for nxt in lines[i + 1:i + 4]:
                if MONEY_LINE.match(nxt):
                    balance = money(nxt)
                    break
            break
    out, current_date, tx = [], None, None
    for l in lines:
        m = DATE_LINE.match(l)
        if m:
            try:
                current_date = datetime.strptime(m.group(1), "%d %b %Y").date()
            except ValueError:
                pass
            continue
        if l in TYPES:
            tx = {"type": l, "desc": [], "nums": []}
            continue
        if tx is None:
            continue
        if MONEY_LINE.match(l):
            tx["nums"].append(money(l))
            if len(tx["nums"]) == 2:
                amount, new_balance = tx["nums"]
                signed = -amount
                if balance is not None and abs((new_balance - balance) - amount) < 0.005:
                    signed = amount
                balance = new_balance
                if current_date:
                    out.append({
                        "id": f"s{len(out) + 1:04d}",
                        "date": current_date.isoformat(),
                        "type": tx["type"],
                        "description": clean_description(tx["desc"]),
                        "amount_gbp": round(signed, 2),
                    })
                tx = None
            continue
        tx["desc"].append(l)
    return out


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9.]+", " ", s.lower()).strip()


def tokens(s: str) -> set[str]:
    return {t for t in re.findall(r"[a-z]{3,}", s.lower()) if t not in STOP}


def parse_any_date(s: str):
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%d %B %Y", "%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def verify_evidence(item: dict, transactions: list[dict], text: str) -> dict | None:
    d = parse_any_date(item.get("date", ""))
    try:
        amt = abs(float(item.get("amount_gbp")))
    except (TypeError, ValueError):
        return None
    words = tokens(item.get("description", ""))
    if not d or not words:
        return None
    for t in transactions:
        if t["date"] == d.isoformat() and abs(abs(t["amount_gbp"]) - amt) < 0.005 and words & tokens(t["description"]):
            return {"date": t["date"], "description": t["description"], "amount_gbp": t["amount_gbp"]}
    flat = norm(text)
    amount_str = f"{amt:,.2f}".replace(",", " ")
    date_str = norm(d.strftime("%d %b %Y"))
    for m in re.finditer(re.escape(amount_str), flat):
        window = flat[max(0, m.start() - 400): m.end() + 100]
        if date_str in flat[max(0, m.start() - 1500): m.end()] and words & set(window.split()):
            return {"date": d.isoformat(), "description": item.get("description", ""), "amount_gbp": -amt}
    return None


def as_account_transactions(statement_txs: list[dict]) -> list[dict]:
    rules = [
        ("UNIVERSAL CREDIT", "benefit", "DWP Universal Credit"),
        ("DWP", "benefit", "DWP Universal Credit"),
        ("CHILD BENEFIT", "benefit", "HMRC Child Benefit"),
        ("PAYROLL", "income", None),
        ("PARENTPAY", "school_meals", None),
        ("CLUB", "childcare", None),
        ("RENT ", "rent", None),
        ("LETTINGS", "rent", None),
        ("CTAX", "council_tax", None),
        ("COUNCIL", "council_tax", None),
        ("ENERGY", "energy", None),
        ("GAS", "energy", None),
        ("UTILITIES", "water", None),
        ("WATER", "water", None),
        ("SCHOOL MEALS", "school_meals", None),
        ("MOBILE", "mobile", None),
        ("BROADBAND", "broadband", None),
    ]
    out = []
    for t in statement_txs:
        up = t["description"].upper()
        cat, merchant = "other", None
        for key, c, name in rules:
            if key in up:
                cat, merchant = c, name
                break
        if cat == "income" and t["amount_gbp"] < 0:
            cat = "other"
        out.append({
            "id": t["id"],
            "date": t["date"],
            "merchant": merchant or t["description"].split(" , ")[0].title(),
            "description": t["description"],
            "amount_gbp": t["amount_gbp"],
            "category": cat,
        })
    return out
