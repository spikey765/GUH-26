PROVIDER = "gemini"
MODEL = "gemini-3.5-flash-lite"
THINKING_LEVEL = "minimal"
TIMEOUT_SECONDS = 25

PROFILE_GUESS_PROMPT = """You help fill in an "About you" form for a UK budgeting app used by people on tight budgets.
You get a bank statement (or a list of bank transactions) and the form fields with allowed options.

For each form field, return:
- value: your best guess. For fields with options, use one of the exact option strings. Use null (or an empty list) if the statement does not show it.
- confidence: "high", "medium" or "low".
- reason: one short sentence in plain English, reading age 9 to 11. No jargon.
- evidence: the statement lines that support the guess. Copy each line's date, description and amount exactly as they appear. Up to 5 lines. Never make up a line.

Rules:
- Only fill in the fields listed. Do not guess or mention health, disability, ethnicity, religion, nationality, sexuality, politics or anything else about the person.
- Pay amounts must come from income lines you cite. pay_min_gbp and pay_max_gbp are the lowest and highest usual weekly pay.
- Do not guess how many adults live in the home or how many children there are or their ages. A statement can't show these. The person fills them in.
- If something is not on the statement, leave it empty with low confidence and say what is missing."""

FORM_OPTIONS = {
    "job_type": "free text, e.g. Care worker",
    "contract_type": ["Permanent", "Zero-hours", "Agency", "Fixed-term", "Self-employed"],
    "pay_frequency": ["Weekly", "Fortnightly", "Four-weekly", "Monthly"],
    "pay_min_gbp": "number, lowest usual weekly pay in pounds",
    "pay_max_gbp": "number, highest usual weekly pay in pounds",
    "benefits": ["Universal Credit", "Child Benefit", "PIP", "Carer's Allowance", "Pension Credit"],
    "housing": ["Private renting", "Council or housing association", "Own with a mortgage", "Living with family"],
    "area": "town or city",
    "energy_payment": ["Direct debit", "Prepayment meter", "Pay when the bill comes"],
}
