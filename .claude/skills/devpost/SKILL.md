---
name: devpost
description: Draft the Devpost submission from the repo history.
disable-model-invocation: true
---

## Commits

!`git log --oneline --no-merges || true`

## Task

Read the commits above, README.md and CLAUDE.md, then draft these Devpost sections: Inspiration, What it does, How we built it, Challenges we ran into, Accomplishments we're proud of, What we learned, What's next.

Open with the persona and her problem. Map the product to the NatWest judging criteria in CLAUDE.md without naming them as a list. Follow the plain-english skill. Each section is 2 to 4 sentences. Name real tools, numbers and decisions from the repo. Do not invent features that aren't in the code. Also list the Built With tags. Write the draft to `DEVPOST.md` and show it.
