# Start here

## What goes in your repo

Put all of this at the root of an empty repo, keeping the `content/` and `lib/` folders:

```
your-repo/
  START-HERE.md
  KICKOFF-PROMPT.txt          ← copy this into Claude Code
  SPEC-v2.md                  ← base spec
  SPEC-v2-ML-OVERLAY.md       ← AI/ML engineering emphasis
  SPEC-ADDENDUM-ESCALATION.md ← Telegram human-in-the-loop feature
  ZERO-COST-STACK.md          ← free infrastructure
  PHASE-0.md                  ← what to build first
  INTAKE.md                   ← for you, not for Claude Code
  content/profile.yaml        ← pre-filled from your résumé; fill the TODOs
  lib/schema.ts
  lib/config.ts
```

Then:

```bash
git init && git add . && git commit -m "specs and profile"
```

## Precedence on conflicts

1. `ZERO-COST-STACK.md` wins on anything infrastructural — hosting, storage, providers.
2. `SPEC-v2-ML-OVERLAY.md` wins on everything else. It replaces SPEC-v2 §2, §14, §19 and §20.
3. `SPEC-v2.md` is the base.
4. `SPEC-ADDENDUM-ESCALATION.md` is self-contained (Phase 8.5).

The specs say this themselves, and so does the kickoff prompt. It's repeated here because
precedence is the thing that gets lost.

## The file that isn't for Claude Code

`INTAKE.md` is your worksheet. It lists what still needs deciding or writing, in priority
order. Claude Code can read it harmlessly, but it's addressed to you.

## Build order

Phase 0 is in `PHASE-0.md`. Phases 1–10 are in `SPEC-v2-ML-OVERLAY.md` §19 — that list
replaces the one in SPEC-v2. One phase per session, review the diff, commit.

The order is deliberately not the obvious one. The eval harness (Phase 3) comes before the
chat UI (Phase 5), and the ablation study (Phase 4) before both. Building the visible part
first is the natural instinct and it will cost you the measurements that make this project
worth showing.

## Before Phase 1

Phase 1 ingests your written content. If `content/case-studies/` is empty, Phase 1 is
untestable and Phase 4's ablation is meaningless. Write these first, structure in
INTAKE.md §4:

- `content/case-studies/delivery-time-prediction.md`
- `content/case-studies/nyc-taxis-eda.md`
- `content/case-studies/capgemini-automation.md`
- `content/decisions/` — 3 short ADR-style entries

`content/case-studies/this-assistant.md` gets written after Phase 4, with the real ablation
numbers in it. It will be your strongest one.

## Two habits from day one

Keep a running list of things that didn't work, in `EXPERIMENTS.md`. It costs nothing and it
answers the interview question most candidates have no answer to.

Don't ship a feature you can't explain. The list in `SPEC-v2-ML-OVERLAY.md` §20 is the test.
If the answer to any of it is "Claude Code chose it", learn it or cut it.
