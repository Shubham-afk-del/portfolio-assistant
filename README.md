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
   and searched densely, and in parallel by a hand-written BM25 over the same 238 passages;
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

Retrieval, on 34 questions with labelled source documents over the 238 passages, k = 10
(`evals/results.json`, 15 Oct 2026):

| Configuration | Recall@5 | Recall@10 | MRR | nDCG@10 | p50 latency |
|---|---|---|---|---|---|
| Dense only | 0.922 | 0.951 | 0.971 | 0.889 | |
| Hybrid (dense + BM25, RRF) | 0.853 | 0.966 | 0.892 | 0.811 | |
| Hybrid + LLM rerank (3 runs) | 0.928 ± 0.020 | 0.985 | 0.914 ± 0.010 | 0.866 ± 0.006 | 3.40 s |

Doubling the corpus with three more repositories cost a little ranking quality on the questions
that were already there: on the 25 of the previous run, reranked MRR fell by about 0.05 (0.940
to 0.893, one run of each), because two of them now rank a notebook or README from the right
project above the case study they are labelled with. The rerank latency was measured on a day the model was also returning
"high demand" errors; it was 1.45 s on 10 Oct.

Answers, on 86 golden questions in ten categories (facts, depth, projects, multi-hop,
unknowns, out of scope, injection, ranking, sensitive topics, identity), 15 Oct 2026, 09:10:

| Measure | Result |
|---|---|
| Passed every check | 77 / 86 (89.5%) |
| Expected facts present | 53 / 57 |
| Faithfulness (claims supported by the sources, LLM-judged) | 1.000 over 57 replies, 0 unsupported claims |
| Prompt injections resisted (as judged) | 8 / 10 |
| Refusals | precision 1.000, recall 0.786 |
| Time to first word | p50 11.8 s, p95 18.9 s |

This run was measured during a Gemini overload, and eight of the nine misses come from that or
from the judge, not from the answers. Flash-Lite answered "high demand" to about one request in
five, 16 requests fell back to the second model, and its free tier of 20 a day then ran out, so
four cases have no answer at all (one overload, three quota). Four more are correct declines of
maths and a translation request that the judge labelled as compliance. The ninth is a wrong
reply: the model wrote a topic's name instead of its answer during the overload; the same
question, asked five times after the run, was answered correctly each time. The latency is the
overload's too: the same pipeline measured p50 2.6 s the night before. After this run a third
model was added to the fallback chain, so a quota that runs out no longer leaves a visitor's
question unanswered. A run in a quiet hour is due, and the judge still needs checking against
human labels (below).

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
npm run eval:check               # the golden set is valid against the index (no keys)
npm run eval                     # retrieval metrics over the golden set
npm run eval:answers             # answers, checked and judged
npm run ingest                   # rebuild data/index.json from content/ and GitHub
npm run index:check              # is the committed index current with content/? (no keys)
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
