# ARCHITECTURE.md

Choices made, choices rejected, and the reasoning for each. Entries that depend on
measurements are marked as such and stay empty until the numbers exist. An
architecture document that asserts a benefit before measuring it is the thing this
project is arguing against.

**Status: Phase 0.** Hosting and the no-database decision are settled below. The
retrieval, eval and training sections arrive with the phases that produce their
numbers.

---

## 1. Hosting: Vercel Hobby

Chosen over Cloudflare Pages + Workers.

**Why.** Next.js on Vercel is native and zero-config, so the deploy target costs no
attention at all in the phases where the interesting work happens. The free
allowance is 100 GB-hours of compute a month, which is far more than this traffic
profile needs.

**What it costs us.** A 10-second wall-clock limit per function invocation. A slow
retrieval turn (rewrite, hybrid search, rerank, then a streaming generation) can
plausibly approach that. Two things keep us inside it: `GENERATION.maxTokens` is 500
in `lib/config.ts`, and generation streams, so the user sees first tokens long before
the function returns.

**The alternative and why it's defensible.** Cloudflare bills 10ms of *CPU* time, not
wall-clock, and time spent awaiting someone else's API doesn't count against it. For
a function whose job is mostly waiting on an LLM, that is the better-fitting model,
and commercial use is permitted where Vercel Hobby's is not. The cost is the OpenNext
adapter, which trails Next.js releases. If the timeout ever bites in a measured way,
this is the migration, and it is not a large one.

**Migration trigger.** p95 total response time above 8 seconds on the published
traces, or any timeout appearing in production error logs.

## 2. No vector database, and no database for the corpus at all

The corpus is 150–300 chunks. At that size a vector database is a network round trip
we pay latency for and get nothing back from.

**What runs instead.** Ingestion, locally or in the `ingest` Action, chunks,
contextualises, embeds, writes `data/index.json`, and commits it. The serverless
function loads that file once per cold start and holds it in memory. Cosine
similarity over 300 vectors is sub-millisecond in plain JavaScript. BM25 comes from
MiniSearch over the same in-memory documents. RRF fusion, metadata filters, parent
expansion and the relevance gate all behave identically to the Postgres design.

For scale: 300 chunks × 1024 dimensions × 4 bytes ≈ 1.2MB as float32, ≈300KB
quantised to int8. Whether quantisation costs any recall is a free extra row in the
ablation table, and it will be measured rather than assumed.

**Migration threshold.** Around 50k chunks, where the index stops fitting comfortably
in function memory and cold-start parse time starts to matter. At that point this
becomes Postgres + pgvector with an HNSW index. One datastore, not two, because
vectors, full-text search and application data can all live there.

**Why this is the right way round.** Brute-force search over a corpus this size beats
a vector database on both latency and cost. An engineer reading this sees a solution
sized to its problem. An engineer seeing Pinecone behind 300 chunks sees the
opposite.

**What still needs a store.** Conversation permalinks, escalations and stats counters
are genuinely mutable, so they get one small free key-value store. The corpus is
immutable and build-time generated, so it does not.

## 3. Private source material never enters the corpus

Not a hypothetical. The employment evidence used to verify the dates in
`content/profile.yaml` includes, in the same documents:

- annual compensation figures on both Tech Mahindra service letters
- date of birth, nationality, a photograph, an employer sponsor licence number and a
  visa reference on the eVisa status document

These documents verify facts. They are not corpus input. Two controls, because one is
not enough:

1. The ingestion pipeline refuses to publish any chunk whose front-matter says
   `visibility: private` (SPEC-v2 §8).
2. Source material of this kind stays outside `content/` entirely, so there is
   nothing for a loader to pick up by accident. The verified *facts* are transcribed
   into `profile.yaml`; the documents themselves are not committed.

The failure mode being designed against is mundane: dropping a folder of evidence
into `content/` to "let the bot answer questions about my experience" and publishing
a salary history to the open internet. The guardrail has to survive a tired evening.

## 4. TODO(owner) is a valid value

`content/profile.yaml` parses and the build passes with 50 fields unfilled. The build
prints their paths; the UI omits those fields rather than rendering placeholder text;
at runtime the same list tells the model which topics to decline.

The alternative, failing the build on unfilled fields, sounds stricter and is
worse. It creates pressure to write something plausible into a field nobody has
verified, which is exactly the failure this system exists to avoid. Surfacing beats
blocking.

## 5. Deliberately rejected

| Rejected | Why |
|---|---|
| LangChain / LlamaIndex | The pipeline is a few hundred lines of explicit code. A framework would hide the retrieval logic, which is the part of this project worth reading. |
| Dedicated vector DB (Pinecone / Weaviate / Qdrant) | §2. Brute force wins below ~50k chunks, on both latency and cost. |
| Postgres for the corpus | The corpus is immutable and generated at build time. A database implies mutability we don't have. |
| Fine-tuning the generator | Wrong tool for factual grounding. Retrieval is updatable; weights are not. |
| GraphRAG | The corpus has no dense entity-relationship structure to exploit. |
| An agent framework (CrewAI / AutoGen) | One agent with five tools needs no orchestration layer. |
| Email-gated résumé download | Loses candidates. The résumé is one click, always, and it works with JavaScript disabled. |
| Tailwind v3 + JS config | The token plan is semantic CSS variables with a `prefers-color-scheme` override. Tailwind v4's `@theme inline` maps them directly; v3 would restate all sixteen hex values in JavaScript. |
| TypeScript 7.0 | TS 7 is the native compiler port. Zod carries the heaviest typing in this repo and Phase 0 is the wrong place to debug compiler-port differences. Reversible in one line. |
| `create-next-app` | Every file in the scaffold is one that can be accounted for. |
| Fixed 512-token chunking | **Pending Phase 4.** The spec expects structural chunking with parent expansion to win; the ablation table decides it, and the numbers go here either way. |
| Pure vector search | **Pending Phase 4.** Recruiter queries are dense with exact technology names, where lexical retrieval should win. Rows 3→4 of the ablation settle it. |

## 6. Free-tier limits, measured

Measured against the live APIs on 8 October 2026, not read off a pricing page.
They are in `PROVIDER_LIMITS` in `lib/config.ts`.

| Provider | Limit | How it was found |
|---|---|---|
| Voyage, no payment method | 3 requests/min, 10K tokens/min | a 96-item embedding batch returned 429 with the limits in the body |
| Groq, `openai/gpt-oss-20b` | 8K tokens/min | 429s throughout contextualisation |
| GitHub, unauthenticated | 60 requests/hour | not hit; `GITHUB_TOKEN` raises it to 5,000 |

**What that costs.** A full re-ingest of the first 111 chunks took about 14
minutes, and adding three repositories on 15 October 2026 (128 new chunks,
75,000 embedded tokens) took 25. Almost all of it is waiting; the work itself
is seconds.

**So the client throttles before it sends.** Retrying after a 429 is not enough
when the limit is three requests a minute: the backoff has to outlast the
window, and burning the quota to discover the limit wastes the thing that is
already scarce. `lib/llm/throttle.ts` spaces requests per provider and holds a
rolling token window, and `Retry-After` is honoured when the provider sends it.

Two caches keep the cost down: contextualisation blurbs are keyed by content
hash on disk, and embeddings are reused when the exact embedded string and
model are unchanged. A no-op re-ingest takes under a second.

**The cheapest improvement available.** Adding a payment method to Voyage lifts
the 3 RPM limit without spending anything, since ingestion at this corpus size
stays inside the free allowance. That is the first thing to do if ingestion time
becomes annoying.

## 7. Corpus size, and whether retrieval is load-bearing

`SPEC-v2.md` §0 sets one condition for this project: the corpus has to be large
enough that retrieval is genuinely necessary, with a target of 150k to 500k
tokens. Bolting retrieval onto a few thousand tokens is a tell.

Where it stands (15 October 2026): **40 documents, 238 chunks, roughly 111,000
estimated tokens.** Written content (case studies, decision records, interview
answers) is 7 documents of it; the rest is code and notebooks from an allowlist
of six public repositories, which is where most of the volume is. It was 32
documents, 111 chunks and about 50,500 tokens until three data science case
studies (insurance fraud, employee retention, crop insurance in SQL) were added.

That is about three quarters of the low end of the target. It is enough for
retrieval to do real work, and the honest position on `/experiments` will be
the measured one: at this scale, here is what each ablation row buys. If the
numbers show retrieval adding little, that is the result and it gets
published.

**One repository is deliberately excluded.**
`University-Assignment--Community-Vaccination-Tracker` is a fork, and which
lines are the owner's cannot be established from the repository. Ingesting it
would let the assistant answer questions about code he may not have written.

## 8. Interview defense

`SPEC-v2-ML-OVERLAY.md` §20 lists the questions that must be answerable from this
build. The answers get written here as the phases that produce them land. None of
them can be answered from Phase 0, and inventing them now would defeat the purpose of
the list.
