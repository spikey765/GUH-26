---
name: seed
description: Regenerate the dummy data files in api/data. Use when the user asks to reseed, reset or change demo data.
disable-model-invocation: true
---

1. If `api/make_data.py` does not exist, write it. It writes `profile.json`, `transactions.json`, `events.json` and `council_tax.json` to `api/data/` as described in CLAUDE.md under Data. Use a fixed random seed.
2. Run `cd api && uv run python make_data.py`.
3. Report how many transactions were made, which warnings apply to the demo user, and the date and size of the worst day in the 60-day view.
