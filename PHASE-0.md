# Phase 0 — foundation

Goal: a deployed page with Shubham's name, headline, availability and a working résumé
download. Schema validated, config in place, CI running. **No AI in this phase.**

---

## 1. Repo setup

```
your-repo/
  SPEC-v2.md
  SPEC-v2-ML-OVERLAY.md
  SPEC-ADDENDUM-ESCALATION.md
  ZERO-COST-STACK.md
  PHASE-0.md
  content/profile.yaml
  lib/schema.ts
  lib/config.ts
```

Then:

```bash
git init && git add . && git commit -m "specs and profile"
claude "Read SPEC-v2.md, SPEC-v2-ML-OVERLAY.md, SPEC-ADDENDUM-ESCALATION.md,
ZERO-COST-STACK.md and PHASE-0.md. ZERO-COST-STACK wins on infrastructure, the ML
overlay wins on everything else. content/profile.yaml, lib/schema.ts and lib/config.ts
already exist — use them, don't regenerate them. Implement Phase 0 only, then stop."
```

## 2. What Phase 0 must produce

- Next.js App Router + TypeScript **strict** + Tailwind.
- `lib/profile.ts` — loads and parses `content/profile.yaml` with `lib/schema.ts`, exported
  as a typed singleton. Prints outstanding `TODO(owner)` paths to the console at build time
  via `outstandingFields()`. **The build must not fail on them.** It surfaces them; it never
  invents content.
- `public/resume.pdf` and a download that works with no JavaScript.
- Hero rendering real values from the profile, with `TODO(owner)` fields simply omitted
  rather than rendered as placeholder text.
- `.env.example` listing every key the later phases need, with comments. No real keys.
- GitHub Actions: typecheck + lint + build on push. Eval and ingest jobs stubbed with TODOs.
- A 5-minute local setup section in the README.
- Deployed to Vercel or Cloudflare (pick one, record the reason in `ARCHITECTURE.md`).

Not in this phase: chat, retrieval, embeddings, database, any API call.

## 3. The headline

`headline` in the profile is the one field that needs writing before Phase 0 looks finished.
It has three jobs: state the target, establish credibility, and not oversell. The facts
available are the MSc, the NLP specialisation, three years of production IT operations, and
this system as the ML work sample.

Write it yourself. Avoid "passionate", "aspiring", and "leveraging". "Aspiring ML engineer"
in particular reads as a permission-seeking phrase and costs you more than the modesty gains.

## 4. Design brief

Read `/mnt/skills/public/frontend-design/SKILL.md` before writing any UI, and follow its
two-pass process: produce a token plan (4–6 named hex values, typefaces and roles, a layout
concept with an ASCII wireframe, and the principles), critique it against this brief, then
build.

**Subject.** A retrieval-grounded assistant that answers questions about one engineer, where
every claim traces to a source document. **Audience.** Technical recruiters and ML hiring
managers, on a phone, with about 90 seconds. **Job.** Answer the question, and demonstrate
competence by how it answers.

**Direction: make evidence the visual system.** The distinctive thing about this product is
that nothing is asserted without a source. So citations are first-class typography — part of
the type scale, designed, not an afterthought superscript. On wide viewports, sources sit in
a margin column beside the answer so the grounding is visible next to the claim; on mobile
they collapse to expandable inline references. That device is the memorable element. Spend
the boldness there and keep everything else quiet.

**The hero is not a name and a tagline over a gradient.** The chat input is the product;
open with it. Name, headline, availability and the résumé button are supporting information
around it, not a banner above it.

**Specifically avoid** (these are current generated-design tells, per the skill file): cream
backgrounds near #F4F1EA with a terracotta accent near #D97757; near-black with one acid
accent; identical rounded cards with the same soft grey shadow; tracked-out ALL-CAPS eyebrow
labels; meta strings joined with middle dots; "→" appended to button text; fade-and-slide-up
entrances on every section.

**Monospace is permitted only for genuine tabular data** — latency figures, eval metrics, the
ablation table. Not for decorative small labels, which is the tell.

**Quality floor, unannounced:** responsive to 360px, visible keyboard focus, `prefers-reduced-motion`
respected, AA contrast, no layout shift when the mobile keyboard opens.

## 5. Done when

- [ ] `npm run dev` renders the hero from `profile.yaml`
- [ ] Résumé downloads on desktop and mobile
- [ ] `npm run typecheck` and `npm run build` pass
- [ ] Build log lists the outstanding `TODO(owner)` paths
- [ ] CI green on a push
- [ ] Live on a URL
- [ ] `ARCHITECTURE.md` started: hosting choice, and the no-vector-DB decision from
      ZERO-COST-STACK §4 written up with the reasoning

## 6. Then stop

Phase 1 is ingestion, and it needs written content to ingest. Before starting it, write two
case studies and the Capgemini automation write-up — with the numbers. An empty corpus makes
Phase 1 untestable and Phase 4's ablation meaningless.
