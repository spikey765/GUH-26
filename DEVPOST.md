# HeadsUp

## Tagline
HeadsUp warns people on tight budgets about money surprises before they hit, like bill rises, school holidays and winter heating, and helps them get ready in time.

## Inspiration
Most costs that hurt people on low or irregular pay aren't really surprises. Energy prices are announced weeks ahead. Phone, water and council tax go up every April. Free school meals stop every school holiday. But nobody connects any of this to your own account, so you find out when the money has already gone. Banks show what you spent. We wanted one that shows what's coming.

## What it does
You connect your bank (mocked for the demo) and answer a short "About you" form: job, contract, pay pattern, benefits, housing. Or upload a bank statement and HeadsUp fills the form in for you, showing the statement lines behind every answer so you can accept or reject each one.

HeadsUp then shows your balance for the next 60 days and marks the tight weeks in red. Scroll the chart sideways to see your past balance next to what's coming. Upcoming changes that affect you, like the January energy price change or a school holiday, appear as warnings with the cost to you, the date, the source and how sure we are (confirmed, forecast, or likely based on past years). Each warning comes with one thing to do now, and nothing happens until you say yes. A "What if?" button lets you test a shock like a £300 boiler repair and see whether you'd cope, with a weekly amount to put aside. You can also just say it out loud: "my car fails its MOT in December, about £200", and HeadsUp turns that into the what-if for you.

"News for you" picks stories about household bills, reads the actual page and tells you, out loud if you want, what it means for you. For example: GOV.UK says you can get £150 off your electricity bill, because you get Universal Credit. Then it gives you one thing to do next. Voice makes the app usable for people who find reading forms and statements hard.

Our demo user is a care worker on a zero-hours contract, paid weekly, a single parent on Universal Credit, renting in Manchester.

## How we built it
Next.js 15, React 19, Tailwind and shadcn/ui on the front end, with Recharts for the 60-day forecast. A FastAPI back end works out the forecast: it finds recurring pay and bills in 12 months of transactions, projects 60 days with a low and high band, then applies the upcoming changes that match the user. Supabase handles login and stores the profile, confirmed actions and an AI activity log, with row-level security. Gemini reads the uploaded PDF statement and returns structured guesses for each form field, turns spoken what-ifs into a cost and a date, and summarises news pages against the user's own facts. ElevenLabs handles voice both ways: speech-to-text for what you say and text-to-speech to read summaries back. All bank data is made up for the demo, including a 4-page dummy statement from a fictional bank. The news stories link to real pages, which the back end fetches and reads.

## Challenges we ran into
Making the AI trustworthy. Gemini sometimes cites lines that aren't on the statement, so the back end extracts the PDF text and drops any evidence it can't find there. The AI never guesses household size, children or anything sensitive, because a statement can't show that. Keeping the maths in code and out of the model meant the numbers on screen are always the same numbers the forecast uses. The news summaries follow the same rule: they can only use figures from the page or from the user's own profile, never new ones.

## Accomplishments that we're proud of
The statement upload: drop in a PDF and the form fills itself in a few seconds, with a "Why?" for every answer. Saying a surprise cost out loud and watching the forecast change. And the moment in the demo where a red week turns green after you say yes to putting a few pounds aside.

## What we learned
Starting from one person's real week (pay that changes, a bill that lands two days before payday) gave us better features than starting from a list of finance tools. And dummy data was the right call for six hours. It let us spend the time on the experience.

## What's next
Real account data through open banking, live feeds from Ofgem, Ofcom, councils and the Met Office, a council tax explainer that shows what each part of the rise pays for, and warnings when news about your employer suggests your hours might drop.

## Built with
nextjs, react, typescript, tailwindcss, shadcn-ui, recharts, fastapi, python, supabase, postgresql, gemini, google-genai, elevenlabs, pypdf
