# Portfolio assistant

An ML system with a measured retrieval pipeline, a trained scope classifier, and an eval
harness that gates deploys. It happens to answer recruiters' questions about
Shubham Kumar Singh's engineering work. Every claim it makes traces to a source document.

**Status: Phase 0 (foundation).** No AI, no retrieval, no database yet. What exists is the
schema-validated profile, the design token layer, and CI. The build order and the reasoning
behind it are in `SPEC-v2-ML-OVERLAY.md` §19.

---

## Five-minute local setup

Requires Node 20+ and npm. Nothing else. Phase 0 makes no network calls and needs no keys.

```bash
git clone <this repo> && cd portfolio-assistant
npm install
cp .env.example .env.local   # every value can stay empty for Phase 0
npm run dev                  # http://localhost:3000
```

`npm run dev` and `npm run build` both print the outstanding `TODO(owner)` paths in
`content/profile.yaml` before starting. That list is expected output, not an error. See below.

```bash
npm run typecheck   # next typegen && tsc --noEmit, strict, no `any`
npm run lint
npm run build
npm run profile:check   # just the outstanding-fields report
```

## Why the build tolerates unfilled fields

`TODO(owner)` is a **valid value** everywhere in `content/profile.yaml`. The build surfaces
those paths via `outstandingFields()` and the UI omits them; it never substitutes placeholder
or invented content. Failing the build on them would create pressure to write something
plausible into a field nobody has verified, which is the one thing this system must not do.
The same paths are handed to the model at runtime as topics it must decline.

## Layout

```
app/          routes; globals.css is the only implementation of the token plan
lib/          profile.ts (loader), schema.ts (zod), config.ts (models + thresholds)
content/      profile.yaml, structured facts, always in the system prompt, never retrieved
public/       resume.pdf, authoritative; the download works with JavaScript disabled
scripts/      check-profile.ts, the build-time outstanding-fields report
```

`lib/config.ts` is the single source of truth for model IDs, retrieval flags and thresholds.
No value in it is ever duplicated as a literal elsewhere; the ablation study in
`SPEC-v2-ML-OVERLAY.md` §E is a sweep over `RETRIEVAL_CONFIG`, which only works if the
pipeline reads every option from there.

## Documents

| File | What it is |
|---|---|
| `SPEC-v2.md` | base spec |
| `SPEC-v2-ML-OVERLAY.md` | AI/ML emphasis; replaces §2, §14, §19, §20 of the base |
| `SPEC-ADDENDUM-ESCALATION.md` | human-in-the-loop answer relay (Phase 8.5) |
| `ZERO-COST-STACK.md` | the £0 infrastructure; wins on all infrastructure conflicts |
| `PHASE-0.md` | what Phase 0 must produce |
| `DESIGN-TOKENS.md` | the approved token plan, its critique, and the computed contrast ratios |
| `ARCHITECTURE.md` | choices made, choices rejected, and why |
| `INTAKE.md` | the owner's worksheet; not build input |

Precedence on conflicts: `ZERO-COST-STACK.md` on infrastructure, then
`SPEC-v2-ML-OVERLAY.md`, then `SPEC-v2.md`.
