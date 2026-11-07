# GUH 2026 project

GreatUniHack 2026, Manchester, 7 Nov. Hard submit 18:00. NatWest challenge. Judges score the demo, not code completeness. Dummy data is allowed.

## Product
The app warns people on tight budgets about money surprises before they hit, like bill rises, school holidays and winter heating, and helps them get ready in time. Working name: HeadsUp. Team plan: PLAN.md.

Own branding, could sit inside a bank app. No NatWest logos or copied styling.

## Screens
1. Login (Supabase auth).
2. "About you" form: job type, contract type, pay frequency, usual weekly pay range, household (adults, children and ages), benefits, housing, area, how energy is paid. Optional: "Fill it in for me" asks the agent to guess the answers from transactions, with the evidence for each guess. The user confirms or edits every field.
3. 60-day view: projected balance, low/high band, warning markers, tight weeks in red.
4. Warning: what changes, when, cost to this user, label (confirmed / forecast / likely), source, the transactions it matched, past changes, one suggestion.
5. Suggestion: yes/no step. Saying yes updates the 60-day view.
6. Council tax: "Why did my council tax go up?" Rise split by part of the bill, what each part pays for, past rises, next April estimate.
7. What if: add a cost on a date (e.g. £300 boiler), see the new 60 days and a weekly saving suggestion.
8. Nice to have: paste a news article, the agent turns it into a warning.

Demo story: "December is coming". School holidays (free school meals stop), heating, the January energy price change and Christmas land in the same weeks.

## Rules
- Code does the maths. The LLM explains, guesses profile fields with evidence, turns articles into warnings and picks suggestions. It never invents figures.
- Only show warnings that match the user's profile or transactions.
- No credit offers. Free help first. Nothing happens without a yes.
- Every agent tool call goes into the agent log shown in the UI.
- Model and prompt config in one file.

## Data
Everything is dummy JSON in `api/data/`, loaded at startup. No external data APIs. Only real services: Supabase auth and the Claude API.
- `profile.json`: default answers for the demo user (care worker, zero-hours, weekly pay £180 to £420, single parent with two children aged 7 and 11, Universal Credit, private renting, Manchester, energy by direct debit).
- `transactions.json`: 12 months of transactions for that profile, with clear merchant names (DWP Universal Credit, the care agency, school meal top-ups, rent, energy, water, mobile, broadband, council tax, a once-a-year car insurance payment). Fixed random seed.
- `events.json`: 8 to 10 upcoming changes. Realistic, source name and URL where we have one. Each: `{id, title, category, effective_date, change_type: "percent"|"fixed", change_value, label: "confirmed"|"forecast"|"likely", source_name, source_url, history: [{date, change}], applies_if: {profile or transaction category}, suggestion}`.
- `council_tax.json`: Manchester bill split by part (council, adult social care, mayor's police, mayor's fire), 3 years of rises, what each part funds.

## Stack
- web/: Next.js (App Router, TypeScript, Tailwind, shadcn/ui), pnpm
- api/: FastAPI, uv
- Auth: Supabase
- Models: Claude via `anthropic`, Gemini via `google-genai` as fallback
- Voice (optional): ElevenLabs TTS

## Commands
- `cd web && pnpm dev`
- `cd api && uv run uvicorn main:app --reload --port 8000`
- `cd api && uv run python make_data.py`

## Working style
- Plan first for changes touching more than one file; small diffs.
- Code without comments.
- Short responses; say what changed, where and why.
- Never stage, commit or push without explicit permission. Show the diff first.
- Secrets only in `.env`; never print or commit them.
- Finish the demo path before adding features. Flag anything that risks 18:00.
- Prose for people (README, Devpost, pitch, UI copy) follows the plain-english skill.
