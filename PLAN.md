# GUH'26 plan

NatWest challenge: AI-powered financial inclusion and resilience.

## The idea in one line
A money forecast that sees bill changes coming. It reads trusted UK sources, keeps only the changes that hit your own bills, puts them on your next 60 days, and tells you what to do now.

Pitch line: "Your bank sees April coming for you."

## Who it's for
Amira, 31, Greater Manchester. Zero-hours care worker, single parent. Weekly pay that changes with her shifts, plus Universal Credit. She has no buffer, so a £6 rise she didn't see coming is a real problem.

## The problem
- Bill rises are announced months ahead (energy price cap, April rises for council tax, water, mobile and broadband), but nobody connects them to her bills.
- Her council tax bill says the rise is 4.99% and nothing else. Finding out why means digging through council budget papers.
- Banks show what she already spent. Nothing shows what's coming.

## What we build
1. **Timeline.** Her balance for the next 60 days with a low/high band. Event markers. The dip in red.
2. **Event card.** What changes, when, her pound impact, a confidence badge, the source, why she is seeing it (her matched transactions), past changes, and one action.
3. **Council tax explainer (hero feature).** "Why did my council tax go up?" Breaks the rise down by part of the bill (council, adult social care, mayor's police and fire precepts), says what the extra money pays for, shows past rises, estimates next April.
4. **Action.** One tap to set aside £x a week, move a bill date, check Warm Home Discount or a social tariff, or contact the bank's support team. Always a confirm step.
5. **Ingest.** Paste a news article. The agent turns it into an event card and the timeline updates live. This is the AI moment in the demo.

Confidence badges:
- **Confirmed:** the figure is announced.
- **Forecast:** a named forecaster's estimate.
- **Likely pattern:** based on past changes, with that history shown.

## Rules we don't break
- Code does the maths. The AI reads sources, matches, explains and plans. It never makes up a figure.
- She only sees events that affect her.
- Every card shows its source.
- Plain English, simpler-words toggle, large text, voice read-out.
- No loans or credit offers. Free support first. Nothing changes without her confirming.
- Trusted sources only: Ofgem, Ofcom, Ofwat, Bank of England, gov.uk, councils, GMCA, providers, BBC, MoneySavingExpert, Which?.

## How it scores
| Criterion | Our answer |
| --- | --- |
| Customer focus | One real persona, only her bills, reading age 9 to 11, voice |
| Innovation | Turns announcements into personal pound figures on a forecast; explains council tax rises nobody explains |
| Social impact | Hits hardest for people with no slack; free support first; no credit |
| AI and data | Live article ingest, matching, plain-English explanation; badges show how sure we are |
| Feasibility | Uses data a bank already holds plus public announcements |

## 3-minute demo
1. 20s: Amira's week. "She found out about these rises when the money left her account."
2. 40s: Timeline. Red dip in April. Tap it: three changes land together, £37 a month.
3. 40s: Council tax card. "Why did it go up?" Breakdown, what it pays for, past rises.
4. 40s: Paste a fresh energy news article. A new card appears, the timeline moves.
5. 30s: She confirms "set aside £9 a week". The dip turns green. Show the source links and the log of what the agent did.
6. 10s: "Your bank sees April coming for you."

## Scope
Must: timeline, event cards, council tax explainer, one action with confirm, seeded persona, 8 to 10 real events.
Should: live article ingest, simpler-words toggle, voice read-out.
Could: employer watch, deploy to a public URL, more personas.

## Timeline (today)
| Time | Milestone |
| --- | --- |
| 14:00 | P4 at the NatWest workshop. Everyone else building against mock data |
| 15:00 | API contract served with mock JSON; frontend renders it |
| 16:00 | Real seed, real forecast, real events wired in |
| 16:30 | Feature freeze. Only demo-path fixes after this |
| 17:00 | Deployed, backup demo video recorded |
| 17:30 | `/devpost` draft, final rehearsal |
| 18:00 | Submitted |

## Who does what

### P1: Frontend
- Next.js app: timeline chart, event cards, council tax explainer screen, action confirm, ingest box.
- Use the frontend-design skill. Mobile-sized layout; the demo runs as a phone screen.
- Build against `web/src/mocks/*.json` until the API is ready, then switch.
- Owns how it looks. Judges score this.

### P2: Backend and forecast
- FastAPI app, Supabase schema, `/seed`.
- Forecast engine: find recurring income and bills in history, project 60 days, low/high band, apply matched events.
- Event matching: transaction categories to event categories.
- Serves the API contract below. Writes the mock JSON first so P1 isn't blocked.

### P3: AI agent
- Claude tool-calling loop with `agent_events` logging.
- Ingest: article text to structured event with badge, using only figures in the source.
- Explanations: plain English, simpler-words mode.
- Council tax explainer: council budget papers to a per-precept breakdown and what the money funds.
- Guardrails: no invented numbers, no credit advice, confirm before actions.

### P4: Data, research and pitch
- `api/events.json`: 8 to 10 real events with `/add-event`, every one with a source.
- Council tax data for Manchester: last 3 years of rises by precept and what the council said it funds.
- Attend the NatWest workshop at 14:00; bring back what they want to see.
- Pitch script, slides, backup demo video, Devpost via `/devpost`.
- Voice read-out with ElevenLabs if time.

## API contract (agree before 14:00)
| Method | Path | Returns |
| --- | --- | --- |
| GET | `/forecast?customer_id=` | `{days: [{date, balance, low, high}], dip: {date, amount}}` |
| GET | `/events?customer_id=` | `[{id, title, effective_date, impact_gbp, badge, source_name, source_url, matched_transactions, history, action}]` |
| GET | `/council-tax?customer_id=` | `{total_rise_pct, parts: [{name, rise_gbp, funds}], history, next_april: {estimate_pct, badge}}` |
| POST | `/ingest` `{text}` | new event card |
| POST | `/explain` `{event_id, simpler}` | `{text}` |
| POST | `/actions` `{event_id, action, confirmed}` | `{ok, new_forecast}` |
| GET | `/agent-log?customer_id=` | `[{time, tool, reason}]` |

## Nice to have: ElevenLabs track
Their prize wants voice at the core, not bolted on. That would mean Amira talks to her coach ("why is my council tax going up?") and hears the answer, in her own language. Only enter if voice becomes the main way to use the app. A read-out button alone won't win it.
