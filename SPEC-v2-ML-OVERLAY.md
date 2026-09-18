# SPEC-v2-ML-OVERLAY.md — AI / ML Engineering emphasis

> Read with `SPEC-v2.md`. This overlay **amends** it for AI-engineering and MLE targets: it adds
> §§A–G, replaces §2, §14, §19 and §20 of v2, and marks two v2 items as descoped.
>
> Run: `claude "Read SPEC-v2.md then SPEC-v2-ML-OVERLAY.md. The overlay wins on conflicts.
> Implement Phase 0 only, then stop."`

---

## A. Positioning — what the two role families screen for

| | AI Engineer | ML Engineer |
|---|---|---|
| Screens on | LLM systems, RAG, evals, agents, context engineering, guardrails, latency & cost | datasets, training, offline/online metrics, serving, MLOps, drift, classical ML |
| v2 coverage | strong | **none** |

Same repo, two audiences. The overlay closes the MLE gap with §B–§D and sharpens the AI-engineering
story with §E–§F.

**The reframe that matters:** for these roles the project is not "a chatbot about me." It is *an ML
system with a measured retrieval pipeline, a model I trained, and an eval harness that gates
deploys* — which happens to answer questions about me. Lead with that framing everywhere: README,
LinkedIn, the site's own hero copy. Recruiters skim; the framing does more work than any feature.

---

## B. §2 REPLACED — north star for ML roles

Priority order when forced to choose:

1. **An ablation table with real numbers** (§E). One artifact, highest signal density in the repo.
2. **A model you trained, benchmarked against a baseline you'd otherwise have used** (§C).
3. **Eval harness with variance reporting and a validated judge** (§F).
4. **Reproducibility** — a stranger reruns your numbers from a clean clone.
5. **Cost/latency engineering with measurements**, not adjectives.
6. **Groundedness / zero fabrication.**
7. **Interface craft.** Still matters — it's what makes a recruiter stay 90 seconds — but it is now
   seventh, not second. Do not spend Phase 1 on Framer Motion.

---

## C. NEW — the learned scope classifier (the MLE core)

Replaces the Haiku scope guard in v2 §12.2. Build it as a proper sub-project in `ml/`.

**Task.** Binary: is this visitor message in scope (about the owner) or not? Plus an auxiliary
multi-class head for category (`experience`, `skills`, `projects`, `logistics`, `compensation`,
`injection`, `off_topic`) — used for routing and for the `/stats` page.

**Dataset — `ml/data/`.** This is the part interviewers dig into, so do it honestly.

- Target 2,000–4,000 labelled examples. Sources: your 60 golden-set questions, real recruiter
  questions you've been asked, scraped-then-rewritten public recruiter-question lists, synthetic
  generation with Claude across paraphrase/tone/length/typo/multilingual axes, and adversarial
  injection variants written by hand.
- **Synthetic data is fine for training and disqualifying for testing.** Hold out a test set of
  300+ examples that are hand-written or real, never model-generated. Say this in the model card.
  A test set made by the same model family you're benchmarking against is the single most common
  fatal flaw in portfolio ML, and an interviewer will ask.
- Stratified 70/15/15 split, **split before augmentation** so paraphrases of one item can't leak
  across the boundary. Deduplicate near-duplicates by embedding similarity ≥ 0.95.
- `datasheet.md`: provenance, label definitions, the annotation guide you followed, class balance,
  known gaps, inter-annotator agreement if anyone helps you label.

**Models to train — report all three.**

| Run | Purpose |
|---|---|
| TF-IDF + logistic regression | the baseline that keeps you honest; sometimes wins, and saying so is a strength |
| Frozen embeddings + linear probe / small MLP | cheap, strong, a 20-line training loop |
| Fine-tuned small encoder (MiniLM / DeBERTa-v3-small class) | the headline model |

Baseline to beat: **the Haiku zero-shot classifier from v2**. Report it in the same table with the
same metrics. Beating a frontier model on a narrow task with a 20MB model is the whole story.

**Metrics.** Precision, recall, F1 per class, PR-AUC, confusion matrix, calibration curve. Report
mean ± std over 5 seeds.

**Threshold selection on an asymmetric cost matrix.** State the costs explicitly: a false negative
(refusing a real recruiter question) is much worse than a false positive (answering something
mildly off-topic). Pick the operating point from the PR curve to reflect that, write down the
chosen threshold and why. Then add the guardrail that makes it safe: **low-confidence cases fall
through to the Haiku classifier**, so uncertainty is routed, not guessed. Cascade design like that
is exactly what production ML looks like.

**Serving — `ml/serve/`.** Export to ONNX, quantise (dynamic int8), serve via a small FastAPI
container on Fly.io or Modal. Contract: `POST /classify → {in_scope, category, confidence, p99_ms}`.
Health check, warm instance, and a **fallback to Haiku if the service is unhealthy or slow** —
the app must never hard-depend on your own model. Record p50/p99 and model size before and after
quantisation.

Alternative worth measuring and mentioning: in-process ONNX Runtime inside the Node function, no
network hop, at the cost of cold starts and bundle size. Measure both, pick one, document the
tradeoff.

**`ml/MODEL_CARD.md`** — intended use, out-of-scope use, training data and its synthetic
proportion, metrics with variance, the operating threshold and its cost rationale, failure modes
you found, fairness note (does it behave differently on non-native-English phrasing? test it),
and how to retrain.

---

## D. NEW — stretch ML work, in priority order

Only after §C ships and the ablation table exists. One of these, done well, beats all three rushed.

1. **Embedding adapter.** Train a low-rank linear projection on top of frozen Voyage embeddings
   using your own (query → correct chunk) pairs from the golden set, with in-batch negatives and a
   contrastive loss. Measure recall@10 lift. Tiny model, real retrieval-quality gain, and a clean
   demonstration that you understand representation learning. Best value of the three.
2. **Cross-encoder reranker fine-tune.** Distil Voyage rerank scores onto a small cross-encoder over
   your corpus, with hard negative mining from BM25. Evaluate with nDCG@10. Report the latency/
   quality/cost frontier against the hosted reranker — including the case where the hosted one wins.
3. **Query-rewrite distillation.** Fine-tune a small seq2seq on Haiku's rewrites. Lowest value;
   include only if latency traces show rewriting is actually your bottleneck.

Say plainly in `ARCHITECTURE.md` which of these you tried and abandoned, and why. Negative results
with numbers read as research maturity.

---

## E. NEW — the ablation study (`/experiments`)

The centrepiece. One table, every row a real run on the golden set.

| # | Configuration | recall@10 | nDCG@10 | faithfulness | p50 TTFT | $/conv |
|---|---|---|---|---|---|---|
| 0 | no retrieval (system prompt only) | — | — | | | |
| 1 | dense only, fixed 512-token chunks | | | | | |
| 2 | dense only, structural chunks | | | | | |
| 3 | + parent-document expansion | | | | | |
| 4 | + BM25, RRF fusion | | | | | |
| 5 | + contextualised chunks before embedding | | | | | |
| 6 | + reranking | | | | | |
| 7 | + metadata filters from query rewrite | | | | | |
| 8 | + embedding adapter (§D1, if built) | | | | | |

Rules that make it credible: change one thing per row. Same golden set, same judge, same seeds.
Report mean ± std over 3 runs, not single numbers. **Include rows that made things worse** — a
monotonically improving ablation table is a table nobody believes. Note k, chunk size and threshold
sweeps separately with the sweep curves plotted.

Publish at `/experiments` with the methodology and the plots. Write a short `EXPERIMENTS.md`
narrating what you expected, what happened, and what surprised you.

This single page is the strongest thing in the build for an ML hire. If you ship nothing else from
this overlay, ship this.

---

## F. §14 REPLACED — eval rigour

Everything in v2 §14 stays. Add:

- **Variance.** LLM-judged metrics are noisy. Every reported number gets mean ± std over ≥3 runs,
  and CI compares against a confidence interval, not a point value. Quoting a single decimal from
  one run is the giveaway that someone hasn't run evals before.
- **Validate the judge.** Hand-label 100 responses for faithfulness, then report the judge's
  agreement with you (Cohen's κ). An unvalidated LLM judge is an unmeasured instrument. Include the
  κ on `/evals`.
- **Offline vs online.** Golden set = offline. Real recruiter queries + the live faithfulness
  monitor = online. Publish both and **publish the gap.** Explaining a discrepancy between your
  offline metric and production behaviour is a senior-level talking point.
- **Drift.** Weekly job: embed the week's real queries, compare the distribution to the golden set,
  flag questions no golden case covers, and queue them for labelling. A closed data loop from
  production back into the training set, documented as a diagram, is MLOps evidence with no
  additional infra.
- **Regression gates in CI.** Faithfulness below CI lower bound → fail. Any injection case
  regressing → fail. recall@10 dropping >2 points → fail. Post the eval table as a PR comment.

---

## G. NEW — reproducibility and experiment tracking

- **Experiment tracking**: Weights & Biases or MLflow for every training and eval run — config,
  seed, git SHA, metrics, artifacts. Link a public W&B report from the README.
- **Seeds pinned** everywhere; `temperature: 0` for judges; model IDs pinned, never aliases.
- **`make reproduce`** — clean clone to reproduced ablation table, documented in the README with an
  honest runtime and cost estimate.
- **Artifacts content-hashed and versioned** (corpus snapshot, embeddings, classifier weights) so a
  result maps to exact inputs. DVC if you want the tooling story, plain hashes if not.
- Notebooks for exploration only, under `ml/notebooks/`, never imported by anything that runs.
  Training and eval code lives in modules with tests.

---

## Corpus shift (amends v2 §4)

Weight the corpus toward ML work. Recruiters for these roles search for evidence of *judgment on
models and data*, not feature counts.

- Case studies should be ML-shaped: a data quality problem you found and fixed, a model that failed
  in production and why, an eval you designed, a training run you debugged, a latency or cost
  optimisation with before/after numbers.
- **The decision log is the highest-value document you own.** ADR-style entries on real calls:
  why this loss, why this split, why you rejected fine-tuning, why you shipped the simpler model.
- If your professional ML experience is thin, **this project becomes case study #1** — written up
  properly with the ablation numbers, the classifier model card, and the negative results. That is
  a legitimate and effective answer. Say openly that it's a personal project; a well-documented
  personal system beats a vaguely described work project.
- Add an `interview-answers/` set covering ML system design, eval design, and "tell me about a model
  that didn't work" so the bot stays consistent with what you say in the room.

---

## §19 REPLACED — build phases

0. **Foundation** — repo, strict TS, Drizzle + Neon + pgvector, config, CI skeleton, hero with
   working résumé download. No AI.
1. **Corpus + ingestion** — `profile.yaml`, 4 ML-shaped case studies, 3 decision notes, résumé.
   Loaders, structural chunking, contextualisation, embedding, hash-based upsert. `pnpm search
   "embeddings"` from the CLI proves retrieval before any UI exists.
2. **Retrieval pipeline behind a config flag** — every ablation row in §E switchable from
   `lib/config.ts`. Build it configurable from day one or the ablation becomes a rewrite.
3. **Eval harness FIRST** — golden set, retrieval metrics, judge, variance, `pnpm eval`. Before the
   chat UI. This inversion against v2 is deliberate: eval-driven development is the thing you're
   claiming to know how to do.
4. **Ablation study** — run every row, plot the sweeps, write `EXPERIMENTS.md`, pick the winning
   config on evidence. Ship `/experiments`.
5. **Chat** — streaming route, guardrails, agent loop, inline citations, transcript UI.
6. **Classifier sub-project (§C)** — dataset, datasheet, three runs, Haiku baseline, threshold
   choice, ONNX export, deployed endpoint with fallback, model card. Wire into the guard path.
7. **Tools + generative UI** — remaining tools, blocks, JD fit check.
8. **Hardening + observability** — rate limits, semantic cache, error states, injection suite green,
   OTel, `/stats`, drift job.
9. **Stretch ML (§D)** — one item, measured, added as ablation row 8.
10. **Craft** — typography, motion, permalinks + OG images, ⌘K, a11y, Lighthouse, `ARCHITECTURE.md`,
    README with `make reproduce`.

Descoped from v2 to make room: voice input, the comparison UI block.

---

## §20 REPLACED — interview defense

Answer these from your own build, in `ARCHITECTURE.md`. Anything you can't answer unaided gets cut.

**Retrieval**
- Why hybrid over pure vector, and what did rows 3→4 of the ablation show?
- Why RRF rather than normalised score weighting?
- What did contextualising chunks buy, at what ingestion cost, and would you do it again?
- How did you pick chunk size and k? Show the sweep.
- Does the reranker justify its latency? At what corpus size does that answer change?

**Training**
- What's in your training data, how much is synthetic, and how do you know your test set is clean?
- Why F1 and PR-AUC rather than accuracy?
- How did you choose the operating threshold, and what cost matrix did you assume?
- Your model beat Haiku on F1 — where does it still lose, and what does the confusion matrix say?
- Why fine-tune an encoder instead of prompt-engineering the LLM harder?
- How would you detect this classifier degrading in production?
- Why not fine-tune the generator model?

**Evals**
- How did you validate the judge? What was κ?
- Why report variance, and what's your run-to-run std?
- Where do offline and online metrics disagree, and what do you think causes it?

**Systems**
- p95 latency, where the time goes, what you'd optimise next.
- Cost per conversation and its biggest line item.
- This corpus 100× larger — what breaks first?
- What did you try that didn't work?

That last question is the one most candidates have no answer to. Keep a running list while you
build. It is free and it is the most convincing thing you'll say.

---

## Honest caveats

- **Depth beats breadth.** One system with an ablation table and a model card outperforms four
  half-built projects. Resist adding a fifth thing.
- **This gets you interviews, not offers.** Product-based MLE loops still test DSA, ML
  fundamentals (bias-variance, regularisation, metric choice, leakage), and ML system design. Budget
  separate time for those; the project doesn't substitute.
- **Don't overclaim.** If you used a hosted reranker, don't say you built a reranker. Your bot
  enforces calibrated skill levels on itself — hold yourself to the same standard, because these
  interviewers verify.
- **Write it up publicly.** A blog post walking through the ablation table, cross-posted, is often
  what actually reaches recruiters. It also feeds the corpus, so it does double duty.
