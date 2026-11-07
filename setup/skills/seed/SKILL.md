---
name: seed
description: Regenerate the synthetic persona data. Use when the user asks to reseed, reset or add demo data.
disable-model-invocation: true
---

1. If `api/seed.py` does not exist, write it: Faker-generated data for the persona in CLAUDE.md, inserted into Supabase with the service role key from `.env`. Clear the tables first so reruns are idempotent. Use a fixed random seed.
2. Load `api/events.json` into the events table and compute event_matches from transaction categories.
3. Run `cd api && uv run python seed.py`.
4. Report row counts per table, the matched events, and the date and size of the forecast dip. Print nothing from `.env`.
