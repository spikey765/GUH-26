# GUH 2026 project

GreatUniHack 2026, Manchester, 7 Nov. Build 12:00 to 18:00, hard submit 18:00. NatWest challenge.

## Brief
AI-powered financial inclusion and resilience. Judged on: customer focus and user-centric design, innovation, social impact and inclusivity, use of AI and data ("financial time travel"), feasibility and a demo that shows customer benefit. Code completeness is not judged. The demo path must be clear, polished and usable; everything off it can be mocked.

## Product
A money forecast that sees bill changes coming. It reads UK announcements and news about household costs, keeps only the events that touch the customer's own transactions, places them on a 60-day balance timeline with a pound impact, and gives one action for each. Pitch: "Your bank sees April coming for you." Own branding, could sit inside a bank app. No NatWest logos or copied styling.

Persona: zero-hours care worker and single parent in Greater Manchester. Weekly variable pay, Universal Credit, energy and water direct debits, mobile and broadband contracts, council tax, rent.

Screens:
1. Timeline: projected balance for 60 days, low/high band, event markers, the dip highlighted.
2. Event card: what changes, when, her estimated pound impact, confidence badge, why she is seeing it (matched transactions and source link), past changes for context, one action.
3. Action: confirm step (set aside an amount weekly, move a bill date, check Warm Home Discount or a social tariff, contact the bank's support team).
4. Council tax explainer: bill breakdown by precept, what the rise funds, history, next April estimate.
5. Ingest: paste an article; the agent extracts a structured event, assigns a badge, matches it and the timeline updates live.

Confidence badges:
- Confirmed: figure announced by the provider or regulator.
- Forecast: estimate from a named forecaster.
- Likely pattern: inferred from previous changes, shown with that history.

Hero feature: "Why did my council tax go up?" The annual bill shows a percentage and nothing else. The agent reads the council's own budget papers and council tax leaflet and breaks the rise down by part of the bill (council, adult social care precept, mayoral police and fire precepts in Greater Manchester), says in plain words what the extra money pays for, shows past rises, and estimates next April with a pattern badge.

Sources: primary and trusted only. Regulators and government (Ofgem, Ofcom, Ofwat, Bank of England, gov.uk, DWP), councils and the Greater Manchester Combined Authority, providers' own notices, and mainstream outlets people use (BBC, MoneySavingExpert, Which?). No forums.

Stretch: employer watch. Match news about the payer on her payslip (closures, redundancies, hours cuts) to warn of income risk.

## Rules
- Numbers come from code. The LLM extracts events, matches categories, explains at a low reading age and plans actions through tools. It never invents figures or certainty beyond its source.
- Events that do not affect her are never shown.
- Every card cites its source.
- Plain English by default, simpler-words toggle, large text, voice read-out.
- No credit offers, no upselling, free support first, nothing changes without confirmation.
- Every tool call is written to agent_events and visible in the UI with a short reason.
- Model and prompt config live in one file so the model can be swapped.

## Stack
- web/: Next.js (App Router, TypeScript, Tailwind, shadcn/ui), pnpm
- api/: FastAPI, uv
- Data: Supabase
- Models: Claude via `anthropic` (primary), Gemini via `google-genai` (fallback)
- Voice: ElevenLabs TTS
- Deploy: Vercel (web), Render or Railway (api)

## Commands
- `cd web && pnpm dev`
- `cd api && uv run uvicorn main:app --reload --port 8000`
- `cd api && uv run python seed.py`

## Data
All synthetic, never real personal data. Tables: customers, accounts, transactions, events, event_matches, agent_events.

`api/events.json` holds hand-checked real UK events. Each event:
`{id, title, category, effective_date, announced_date, change_type: "percent"|"fixed", change_value, badge: "confirmed"|"forecast"|"pattern", source_name, source_url, history: [{date, change}], affects: [transaction categories], action}`

Seed 90 days of history for the persona with a fixed random seed. At least 4 events must match her, producing a visible dip that the actions clear.

## Working style
- Plan first for changes touching more than one file; small diffs.
- Code without comments.
- Short responses; say what changed, where and why.
- Never stage, commit or push without explicit permission. Show the diff first.
- Secrets only in `.env`; never print or commit them.
- Finish the demo path before adding features. Flag anything that risks 18:00.
- Prose for people (README, Devpost, pitch, UI copy) follows the plain-english skill.
