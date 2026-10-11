# Portfolio assistant

An AI assistant that answers recruiters' questions about Shubham Kumar Singh's work, from his
case studies, decision records, interview answers and public code. Every answer shows the
passages it was written from. It is built as an ML system first: a measured retrieval
pipeline, an eval harness and guards, with the chat on top.

Portfolio: [shubham-kumar-singh.vercel.app](https://shubham-kumar-singh.vercel.app)

---

## What it does

- **Answers about him**: projects, experience, skills, education, availability, and how this
  assistant was built. Facts come from his own documents, cited.
- **Declines everything else**: general knowledge, maths, code, trivia. A scope check decides
  before an answer is written, so "what is linear regression?" gets a pointer to how he has
  used it, not a definition.
- **Shows its work**: each stage of the search, timed, while it runs, and the sources with the
  reranker's grade under every answer.

## How it works

1. **Profile in the prompt.** `content/profile.yaml` (dates, titles, grades, skills,
   availability) goes into the system prompt on every turn and is never retrieved: a short
   factual field is exactly what retrieval gets confidently wrong.
2. **Hybrid retrieval.** The question is embedded (Voyage `voyage-3-large`, 1024 dimensions)
   and searched densely, and in parallel by a hand-written BM25 over the same 111 passages;
   the two rankings are fused by reciprocal rank fusion (k = 60).
3. **LLM reranker and gate.** Gemini 3.5 Flash-Lite grades the top 20 candidates on TREC's
   four-level relevance scale in one structured call. Passages under the gate's threshold are
   not shown to the generator.
4. **Scope check.** Beside retrieval, Groq's `gpt-oss-20b` labels the question as about him or
   general (about 0.3 s, so it adds no wait). A general question is answered with a short,
   friendly decline.
5. **Grounded generation.** Gemini 3.5 Flash-Lite (Flash as fallback) streams the answer from
   the profile and the passages that passed the gate, with citations, under rules for
   calibration, scripted sensitive topics and prompt injection.
6. **Guards.** Input and request size caps; per-visitor (20 questions in 10 minutes) and
   site-wide daily limits on the free-tier quotas; a visitor's question never waits more than
   2.5 s for an embedding slot, falling back to keyword search instead.

## Measured

Retrieval, on 25 questions with labelled source documents, k = 10
(`evals/results.json`, 10 Oct 2026):

| Configuration | Recall@5 | Recall@10 | MRR | nDCG@10 | p50 latency |
|---|---|---|---|---|---|
| Dense only | 0.893 | 0.947 | 0.960 | 0.885 | |
| Hybrid (dense + BM25, RRF) | 0.800 | 0.967 | 0.879 | 0.803 | |
| Hybrid + LLM rerank (3 runs) | 0.947 | 0.980 | 0.933 ± 0.012 | 0.888 | 1.45 s |

Answers, on 77 golden questions in ten categories (facts, depth, projects, multi-hop,
unknowns, out of scope, injection, ranking, sensitive topics, identity), 11 Oct 2026:

| Measure | Result |
|---|---|
| Passed every check | 74 / 77 (96.1%) |
| Expected facts present | 48 / 48 |
| Faithfulness (claims supported by the sources, LLM-judged) | 1.000 over 53 replies, 0 unsupported claims |
| Prompt injections resisted | 10 / 10 |
| Refusals | precision 1.000, recall 0.897 |
| Time to first word | p50 2.4 s, p95 8.3 s |

The three misses are disagreements with the judge rather than wrong answers: two correct
declines it labelled as compliance, and a correct "no grade on file yet" it labelled as an
answer. That is why the judge still needs checking against human labels (below).

## Run it locally

Node 20 or later. Three free-tier keys, none needing a card: Gemini
([aistudio.google.com/apikey](https://aistudio.google.com/apikey)), Voyage and Groq.

```bash
npm install
cp .env.example .env.local   # fill in GOOGLE_GENERATIVE_AI_API_KEY, VOYAGE_API_KEY, GROQ_API_KEY
npm run dev                  # http://localhost:3000
```

```bash
npm test                         # unit tests: metrics, rate limits
npm run typecheck && npm run lint && npm run build
npm run search -- "question"     # the retrieval pipeline from the terminal
npm run eval                     # retrieval metrics over the golden set
npm run eval:answers             # answers, checked and judged
npm run ingest                   # rebuild data/index.json from content/ and GitHub
```

`CONTACT_PHONE` is optional: the phone row is shown only when it is set, so the number never
has to live in the repository.

## Deploy

On Vercel: import the repository, add `GOOGLE_GENERATIVE_AI_API_KEY`, `VOYAGE_API_KEY`,
`GROQ_API_KEY` and `CONTACT_PHONE` as environment variables, and deploy. Set
`NEXT_PUBLIC_SITE_URL` only for a custom domain; otherwise the project's own Vercel domain is
used for share previews.

## Layout

```
app/          the page, and api/chat (retrieve, scope check, generate, stream)
components/   chat, profile, shell (glass, particles, cursor), motion primitives
lib/          retrieval/, generation/, llm/ (provider adapters), guards/, config.ts
content/      profile.yaml, case studies, decision records, interview answers
data/         index.json, the embedded corpus, built by `npm run ingest`
evals/        golden.yaml, metrics, the retrieval and answer harnesses, cached runs
public/       resume.pdf, authoritative; the download works with JavaScript disabled
```

`lib/config.ts` is the single source of truth for model IDs, retrieval flags and thresholds;
the ablation table above is a sweep over its `RETRIEVAL_CONFIG`.

## Limits, stated plainly

- Free tiers throughout. The site answers about 200 questions a day in total, and the rate
  limits are kept per server instance, so they stop a loop or a script, not a coordinated
  attack.
- The answer judge (Gemini 3.1 Flash-Lite) has not yet been checked against human labels
  (Cohen's κ), so its scores are provisional.
- Not built yet from the spec: query rewriting and decomposition, parent-chunk expansion, the
  trained scope classifier, and the human-in-the-loop escalation relay.

## Why the build tolerates unfilled fields

`TODO(owner)` is a **valid value** everywhere in `content/profile.yaml`. The build surfaces
those paths via `outstandingFields()` and the UI omits them; it never substitutes placeholder
or invented content. Failing the build on them would create pressure to write something
plausible into a field nobody has verified, which is the one thing this system must not do.

## Documents

| File | What it is |
|---|---|
| `SPEC-v2.md` | base spec |
| `SPEC-v2-ML-OVERLAY.md` | AI/ML emphasis; replaces §2, §14, §19, §20 of the base |
| `SPEC-ADDENDUM-ESCALATION.md` | human-in-the-loop answer relay (Phase 8.5) |
| `ZERO-COST-STACK.md` | the £0 infrastructure; wins on all infrastructure conflicts |
| `DESIGN-TOKENS.md` | the token plan, its amendments, and the computed contrast ratios |
| `ARCHITECTURE.md` | choices made, choices rejected, and why |
| `content/decisions/` | decision records, which the assistant can also cite |

Precedence on conflicts: `ZERO-COST-STACK.md` on infrastructure, then
`SPEC-v2-ML-OVERLAY.md`, then `SPEC-v2.md`.
