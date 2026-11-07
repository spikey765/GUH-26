MODEL = "claude-opus-5-5"
EFFORT = "low"
MAX_TOKENS = 8000

PROFILE_GUESS_SYSTEM = """You help fill in an "About you" form for a budgeting app used by people on tight budgets in the UK.
You get a summary of 12 months of bank transactions, grouped by merchant, and the list of form fields with allowed options.
For each field, give your best guess, a one-sentence reason in plain English (reading age 9 to 11), the ids of the transactions that support it, and your confidence.
Rules:
- Only use evidence in the transactions. Never invent amounts or merchants.
- Pay amounts must come from the income transactions you cite.
- If the transactions do not show something, set value to null, confidence to "low" and say what is missing.
- Use the exact option strings given for fields that have options.
- Children's ages can rarely be known from transactions. Guess only if there is clear evidence, and say how sure you are."""

FORM_OPTIONS = {
    "job_type": "free text, e.g. Care worker",
    "contract_type": ["Permanent", "Zero-hours", "Agency", "Fixed-term", "Self-employed"],
    "pay_frequency": ["Weekly", "Fortnightly", "Four-weekly", "Monthly"],
    "pay_min_gbp": "number, lowest usual weekly pay",
    "pay_max_gbp": "number, highest usual weekly pay",
    "adults": "whole number of adults in the home",
    "children_ages": "list of whole numbers",
    "benefits": ["Universal Credit", "Child Benefit", "PIP", "Carer's Allowance", "Pension Credit"],
    "housing": ["Private renting", "Council or housing association", "Own with a mortgage", "Living with family"],
    "area": "town or city",
    "energy_payment": ["Direct debit", "Prepayment meter", "Pay when the bill comes"],
}
