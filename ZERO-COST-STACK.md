# ZERO-COST-STACK.md — the £0 build

> Amends `SPEC-v2.md`, `SPEC-v2-ML-OVERLAY.md`, `SPEC-ADDENDUM-ESCALATION.md`.
> **This file wins on all infrastructure conflicts.** The phases, evals, ablation study and
> escalation design are unchanged — only what they run on changes.
>
> Free tiers move constantly. Verify every limit below against the provider's own docs before you
> depend on it, and put the date you checked in `ARCHITECTURE.md`.

---

## 1. Why GitHub Pages is out

GitHub Pages serves static files only. No server-side code means nowhere to keep an API key, so the
key ends up in your client bundle, where anyone can read it from devtools and spend your quota.
There is no workaround short of asking each visitor to supply their own key, which defeats the point.

**GitHub still does three jobs:** it hosts the public repo (which recruiters will read, and which is
half the portfolio), it runs ingestion and evals for free via Actions, and a scheduled Action every
5 minutes keeps your function warm so the first recruiter of the day doesn't hit a cold start.

## 2. Hosting

| | Cloudflare Pages + Workers | Vercel Hobby |
|---|---|---|
| Free allowance | 100k Workers requests/day, unlimited bandwidth, 500 builds/month | 100 GB-hours compute/month |
| Commercial use | allowed | **not** allowed (fine for a portfolio) |
| Timeout risk | 10ms **CPU** limit — time spent awaiting a fetch doesn't count, which suits an LLM proxy well | 10s **wall-clock** function limit — a slow RAG turn can get cut off |
| Next.js | via OpenNext adapter, slightly behind | native, zero config |

**Pick Vercel** if you want the path of least friction, and keep `max_tokens` at ~500 with a fast
model so you stay well inside 10 seconds. **Pick Cloudflare** if you'd rather not think about the
timeout at all — for a function whose job is mostly waiting on someone else's API, the CPU-time
model is a better fit. Either is a defensible choice; say which you picked and why.

## 3. Revised stack — every line £0

| Layer | Choice | Real limit to watch |
|---|---|---|
| Hosting | Cloudflare Pages or Vercel Hobby | §2 |
| **Vector store** | **none — in-memory, see §4** | — |
| Lexical search | MiniSearch or Lunr, in-memory | — |
| Embeddings | Voyage free allowance (very large relative to a corpus this size) | one-off ingestion cost is negligible; query embeddings are ~20 tokens each |
| Embeddings fallback | `bge-small` / `all-MiniLM-L6-v2` locally at build time + transformers.js at query time | bundle size, cold start |
| Rerank | Voyage rerank (same free pool), or Cohere free tier (non-commercial only), or LLM listwise rerank | Cohere's monthly call cap |
| Generation | Gemini Flash free tier (no card, current-gen models) | RPM and RPD caps |
| Fast stages (rewrite, contextualise, classify) | Groq — roughly 30 RPM / 1,000 RPD on the free tier | RPD is the binding constraint |
| Conversations, escalations, stats | Upstash Redis free tier or Turso free tier | daily command cap |
| Realtime delivery | poll the permalink every 3s | free, and fine at your traffic |
| Email | Resend free tier, or skip it — Telegram + permalink covers the loop | |
| Notifications | Telegram Bot API | free, no limits that matter |
| Classifier training | Google Colab free GPU | session timeouts — checkpoint often |
| Classifier serving | ONNX int8 in-process (~15–30MB), no separate service | cold start |
| Experiment tracking | Weights & Biases free personal tier | |
| Errors | Sentry free tier | |
| CI | GitHub Actions | free minutes on public repos |

## 4. The change that matters: no database

At 150–300 chunks, a vector database is a network round trip you're paying latency for and getting
nothing back.

**Do this instead.** Ingestion runs locally or in a GitHub Action: chunk → contextualise → embed →
write `data/index.json` (or a packed `Float32Array` binary) → commit it. The serverless function
loads it once per cold start and holds it in memory. Cosine similarity over 300 vectors is
sub-millisecond in plain JavaScript. BM25 comes from MiniSearch over the same in-memory documents.
RRF fusion, metadata filters, parent expansion and the relevance gate all work identically.

Sizes, for sanity: 300 chunks × 1024 dims × 4 bytes ≈ 1.2MB as float32, ≈300KB quantised to int8.
Quantise and measure whether it costs you any recall — that's a free extra ablation row.

**Say this in `ARCHITECTURE.md`, because it's one of your strongest lines:** brute-force search over
a corpus this size beats a vector DB on latency and cost, and you'd migrate to pgvector somewhere
around 50k chunks when the index no longer fits comfortably in function memory. An engineer reading
that sees someone who sized the solution to the problem. An engineer seeing Pinecone behind 300
chunks sees the opposite.

Keep one tiny free key-value store (Upstash or Turso) for conversation permalinks, escalations, and
stats counters. That data is genuinely mutable; the corpus isn't.

## 5. Provider abstraction — required, not optional

`lib/llm/` exposes one interface: `generate`, `stream`, `classify`, `embed`, `rerank`. Behind it,
adapters per provider, a per-stage config mapping, and failover on 429 or 5xx with exponential
backoff to a secondary provider.

This is not over-engineering at £0. Free catalogues churn — models get deleted without notice, and
a hard-coded model name is a site that breaks silently while you're asleep. Build the abstraction,
then use it for something better: run the eval harness across providers and **publish the
comparison table** on `/experiments`. "I benchmarked four providers on my own eval set and here's
the quality/latency/cost frontier" is stronger portfolio content than "I used the best model."

Stage assignments to start with: Groq for classify and rewrite (fast, cheap, high volume), Gemini
Flash for generation and the faithfulness judge (better reasoning), Voyage for embed and rerank.

## 6. Where free genuinely hurts — and what to do

**The eval and ablation runs. This is the real constraint.** 60 questions × 9 configs × 3 seeds,
plus a judge call each, is roughly 3,000+ LLM calls. Against a 1,000/day free cap that's several
days of wall-clock.

Mitigations, all worth building anyway:
- A resumable queue with checkpointing, so an interrupted run continues rather than restarts.
- Aggressive caching keyed on `(config_hash, question, seed)` — identical runs never re-execute.
- 1 seed for exploratory rows; 3 seeds only for the final config and the rows you publish.
- Split across providers so you're not gated by one RPD ceiling.
- Run overnight from a GitHub Action.

**Judge quality.** A weaker free model as faithfulness judge may agree with you less. The spec
already asks you to validate it against 100 hand labels and report agreement — if κ comes out
mediocre on the free model, publish that. An honestly reported measurement limitation reads as
competence, not weakness.

**Generation quality.** A frontier model gives better calibrated, better grounded answers than a
free Flash-class model. Your architecture is what's being assessed, and the eval harness will show
you exactly how much you're giving up. If the gap is large on your own numbers, that's the moment
to spend a few pounds of credit on the generation stage only and leave everything else free.

**Cold starts.** First visit of the day can be slow. The 5-minute GitHub Action ping fixes it.

## 7. The one thing I'd actually pay for

**A domain, about £10–15/year.** `shubham-singh.pages.dev` in a LinkedIn headline undercuts the
impression of the thing it's linking to. This is the highest-return money in the entire project.

Everything else can wait until your own eval numbers tell you it's worth it.

## 8. Amendments by section

- **v2 §5** — remove Postgres/pgvector from the diagram; retrieval reads the in-memory index.
- **v2 §6** — replace the stack table with §3 here.
- **v2 §7** — add two rejection rows: "no vector DB: brute force wins under ~50k chunks, with the
  latency numbers" and "no Postgres: the corpus is immutable and build-time generated."
- **v2 §17** — drop `documents`/`sections`/`chunks` tables; keep `conversations`, `messages`,
  `escalations`, `eval_runs` in the KV or SQLite store.
- **v2 §16** — performance budget still applies, but measure it on the free stack and publish those
  numbers rather than aspirational ones.
- **Overlay §C** — classifier serves in-process via ONNX; drop the FastAPI container and Fly/Modal.
  Keep the Groq/Gemini classifier as the low-confidence fallback path.
- **Escalation §** — replace Supabase Realtime with 3-second polling; email optional.
- **All phases** — unchanged in order and content.

## 9. Cost summary

| | Monthly |
|---|---|
| Hosting, DB, Redis, embeddings, generation, notifications, CI, tracking, errors | £0 |
| Domain | ~£1 (£12/year) |
| Optional: paid credit for the generation stage only, if your evals justify it | £3–5 |

Build the whole thing free. Let the eval numbers, not anxiety, decide whether anything needs paying
for.
