# GUH'26 plan

## In one sentence
Our app warns people on tight budgets about money surprises before they hit, like bill rises, school holidays and winter heating, and helps them get ready in time.

Working name: HeadsUp.

## Who it's for
People with irregular pay and no savings. Our demo user is a care worker on a zero-hours contract, paid weekly, a single parent with two school-age children, on Universal Credit, renting in Manchester.

## The problem
Most costs that hurt them are announced or happen every year: energy price changes, April bill rises, school holidays when free school meals stop, winter heating, once-a-year bills. Nobody tells them in time. Their bank only shows what's already gone.

## How it works
1. They log in and fill in a short "About you" form: job, pay, household, benefits, housing. Or they tap "Fill it in for me" and the AI guesses from their transactions, showing why for each guess. They check every answer.
2. The app shows their balance for the next 60 days, with tight weeks in red.
3. Each upcoming change that affects them gets a warning: what, when, how much for them, how sure we are, and the source.
4. Each warning comes with one thing to do now, like putting £9 a week aside or signing up for free holiday meals. Nothing happens unless they say yes.
5. "Why did my council tax go up?" explains where the extra money goes.
6. "What if?" lets them add a shock, like a £300 boiler repair, and see if they'd cope.

## Dummy data
All data is made up and stored as files in the backend. We don't call any real bank or news APIs. The only real services are login (Supabase) and the AI (Claude). This saves us hours.

## Can the AI work out someone's situation from their statements?
Partly, and fast enough for today because we write the dummy transactions ourselves. Universal Credit payments, a care agency paying different amounts each week, school meal top-ups and rent payments all give strong clues. The AI reads the transactions and fills in the form with a reason for each answer.

It can't be trusted alone. Guesses about family or benefits can be wrong, and people should decide what the app knows about them. So the form comes first and always works on its own. "Fill it in for me" is an extra, and the user confirms every answer.

## The demo (3 minutes): "December is coming"
1. Last December, school broke up, heating went up and Christmas came in the same few weeks. The money was gone before they noticed.
2. Log in. Tap "Fill it in for me". The form fills itself, with reasons.
3. The 60-day view: a red patch in late December.
4. Tap the school holiday warning: dates, extra cost, free holiday meals.
5. The January energy change: "£6 more a month for you from 1 January".
6. "What if my boiler breaks?" The red gets worse. The app suggests £9 a week from now.
7. Say yes. The red turns green.
8. If time: "Why did my council tax go up?"

## What we must finish
Must have:
- login
- "About you" form
- 60-day view
- warnings with one suggestion each
- the yes step
- "What if?"
- dummy data files

Nice to have:
- "Fill it in for me"
- council tax explainer
- paste a news article to make a warning
- read it out loud

## Who does what

### Person 1: the screens
Login, the form, the 60-day view, warnings, "What if?" and the yes step. Uses the dummy files directly at first so they never wait on the backend. Makes it look good.

### Person 2: the data and backend
Writes the dummy files: the user's profile, 12 months of transactions, 8 to 10 upcoming changes and the council tax breakdown. Builds the server that works out the 60 days and matches changes to the user. Sets up Supabase login.

### Person 3: the AI
"Fill it in for me" from transactions, plain-words explanations, suggestions and the council tax explanation. Makes sure the AI never invents numbers and always asks before acting.

### Person 4: research and pitch
Gives Person 2 realistic figures and sources for the upcoming changes and council tax. Goes to the NatWest workshop at 14:00. Writes the pitch and slides, records a backup demo video and writes the Devpost.

## Today
| Time | Goal |
| --- | --- |
| 14:15 | Agree the data format below |
| 15:00 | Dummy files done, screens showing them |
| 16:00 | Server and AI connected |
| 16:30 | Stop adding features. Only fix the demo |
| 17:00 | Backup video recorded |
| 17:30 | Devpost written, practise the pitch |
| 18:00 | Submit |

## For the developers
| Request | Gives back |
| --- | --- |
| `GET /profile` / `PUT /profile` | The "About you" answers |
| `POST /profile/guess` | AI guesses for each field, with the transactions behind each one |
| `GET /forecast` | Balance for each of the next 60 days, low and high, worst day |
| `GET /warnings` | Warnings that apply to this user |
| `POST /simulate {amount_gbp, date, label}` | 60 days with the shock added, weekly saving suggestion |
| `POST /actions {warning_id, confirmed}` | Updated 60 days |
| `GET /council-tax` | Rise by part of the bill, what each pays for, past rises |
| `GET /agent-log` | What the AI did and why |

Dummy files live in `api/data/`. Details are in CLAUDE.md.

## ElevenLabs prize
Only worth entering if voice becomes the main way to use the app, like asking out loud "Why is my council tax going up?" and hearing the answer. A read-out button won't win it.
