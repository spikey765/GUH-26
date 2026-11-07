---
name: add-event
description: Add a real UK household-cost event to api/events.json from a URL or pasted article.
disable-model-invocation: true
---

Input: $ARGUMENTS (a URL or pasted text).

1. Read the source. If it is a URL, fetch it.
2. Extract one event using the schema in CLAUDE.md under Data. Use only figures stated in the source.
3. Badge: confirmed if the provider or regulator announced the figure; forecast if a named forecaster estimated it; pattern only if past changes are given.
4. Fill `history` only from figures in the source or already in events.json.
5. Show the event JSON and ask before appending it to `api/events.json`.
