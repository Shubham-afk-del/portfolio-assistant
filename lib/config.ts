/**
 * Single source of truth for models, thresholds and retrieval configuration.
 *
 * Every retrieval option is a flag here from day one. The ablation study in
 * EXPERIMENTS.md is a sweep over RETRIEVAL_CONFIG — if these become hardcoded
 * in the pipeline, the ablation turns into a rewrite. Nothing below should ever
 * be duplicated as a literal elsewhere in the codebase.
 *
 * Verify model IDs against provider docs before relying on them; free-tier
 * catalogues change without notice. Date last checked: TODO(owner).
 */

// ---------------------------------------------------------------------------
// Providers. One interface, several adapters — free catalogues churn, and a
// hardcoded model name is a site that breaks silently overnight.
// ---------------------------------------------------------------------------

export type Provider = "gemini" | "groq" | "voyage" | "anthropic" | "local";

export const MODELS = {
  /**
   * Final answer generation. Quality matters most here, but the answer is on
   * the path to the first token, and a model that does not answer at all
   * has no quality.
   *
   * Flash-Lite, with Flash as the fallback, from eight test questions on
   * 9 Oct 2026: Flash refused two with 503 "high demand" and did not start
   * a third within 12 seconds, while Flash-Lite answered both questions
   * passed to it and every rerank request. Which writes the more faithful
   * answers is a Phase 4 measurement, not this comment's call.
   *
   * Was `gemini-flash-latest`, which then resolved to gemini-3.8-flash: it
   * rejects thinking level "minimal" and took about 5 seconds to its first
   * token. Pinned for the same reason as the reranker: an eval number has
   * to come from a model that holds still.
   *
   * `thinking` is Gemini 3's thinking level, set per model because not every
   * model accepts every level.
   */
  generate: { provider: "gemini" as Provider, model: "gemini-3.5-flash-lite", thinking: "minimal" },
  /**
   * When `generate` is overloaded (503), out of quota (429) or slow to start.
   * Google counts quota per model, so one still has quota when the other has
   * none. A last resort only: its free tier allows 20 requests a day.
   */
  generateFallback: { provider: "gemini" as Provider, model: "gemini-3.5-flash", thinking: "minimal" },
  /**
   * High-volume, latency-sensitive stages.
   *
   * Was `llama-3.1-8b-instant` until 18 Sep 2026, when it was found to have
   * been removed from Groq's catalogue. `groq/compound` and
   * `groq/compound-mini` went the same way before 8 Oct 2026. Two deletions in
   * three weeks is exactly the churn ZERO-COST-STACK §5 predicts, and the
   * reason every call goes through lib/llm rather than naming a model inline.
   */
  rewrite: { provider: "groq" as Provider, model: "openai/gpt-oss-20b" },
  contextualise: { provider: "groq" as Provider, model: "openai/gpt-oss-20b" },
  /** Fallback for the trained classifier's low-confidence band (Phase 6). */
  classify: { provider: "groq" as Provider, model: "openai/gpt-oss-20b" },
  /**
   * Eval judge. Kept separate so it can be upgraded independently of
   * generation, and a different model from the one it judges, so it is not
   * marking its own work. A little thinking, since checking a claim against
   * its sources is reasoning. Pinned, as above.
   *
   * Meant to be 3.5 Flash, stronger than the generator. Its free tier turned
   * out to allow 20 requests a day (the 429's quota id said so, 10 Oct 2026),
   * and one eval run needs 70. 3.1 Flash-Lite is smaller than the generator,
   * so its agreement with human labels has to be measured (Phase 3 step 4,
   * Cohen's κ) before its scores mean much; SPEC-v2-ML-OVERLAY §F asks for
   * that anyway.
   */
  judge: { provider: "gemini" as Provider, model: "gemini-3.1-flash-lite", thinking: "low" },
  embed: { provider: "voyage" as Provider, model: "voyage-3-large", dimensions: 1024 },
  /**
   * Second-stage relevance, by asking a small LLM to grade each candidate.
   *
   * Was Voyage `rerank-2`, a cross-encoder trained for exactly this job.
   * Without a payment method Voyage allows 3 requests a minute, shared with
   * query embedding, so every reranked search would spend two of the three.
   * ZERO-COST-STACK §3 names an LLM reranker as the free alternative, and the
   * Voyage adapter still implements rerank, so switching back is this line.
   *
   * Pinned rather than `gemini-flash-lite-latest`: an eval number has to come
   * from a model that holds still, and an alias can move between runs.
   * Checked against the live model list on 9 Oct 2026: the alias resolves to
   * this model, and 2.5 Flash-Lite already answers 404 to new keys.
   */
  rerank: { provider: "gemini" as Provider, model: "gemini-3.5-flash-lite", thinking: "minimal" },
} as const;

/** Ordered failover on 429 / 5xx. Stage falls through this list. */
export const FAILOVER: Record<string, Provider[]> = {
  generate: ["gemini", "groq"],
  rewrite: ["groq", "gemini"],
  contextualise: ["groq", "gemini"],
  classify: ["local", "groq", "gemini"],
  judge: ["gemini", "groq"],
};

// ---------------------------------------------------------------------------
// Free-tier rate limits, measured against the live APIs on 8 Oct 2026 rather
// than read off a pricing page. These are the real constraint on this build:
// ZERO-COST-STACK §6 predicted that the eval and ablation runs would be gated
// by request caps, and ingestion hit the wall first.
// ---------------------------------------------------------------------------

export interface ProviderLimit {
  /** Requests per minute. The client spaces requests to respect it. */
  requestsPerMinute: number;
  /** Tokens per minute, counted across requests in a rolling window. */
  tokensPerMinute: number;
  /** Largest single request, left under the per-minute cap for headroom. */
  maxTokensPerRequest: number;
}

export const PROVIDER_LIMITS: Record<string, ProviderLimit> = {
  /**
   * Voyage with no payment method on file: 3 RPM and 10K TPM. Adding a card
   * raises both substantially without spending anything, which is the first
   * thing to do if ingestion time becomes annoying.
   */
  voyage: { requestsPerMinute: 3, tokensPerMinute: 10_000, maxTokensPerRequest: 7_000 },
  /** Groq on_demand, openai/gpt-oss-20b: 8K TPM is the binding limit. */
  groq: { requestsPerMinute: 30, tokensPerMinute: 8_000, maxTokensPerRequest: 4_000 },
  /**
   * Gemini free tier. Not measured like the two above: Google shows free-tier
   * numbers only inside AI Studio, so this is a deliberately low guess. When
   * Google does refuse, the 429 names the quota and its value, and the adapter
   * logs both, so the first refusal replaces the guess with a fact. The first
   * did, on 10 Oct 2026: 3.5 Flash allows 20 requests a day per project. The
   * Flash-Lite models allow far more; several hundred a day went unrefused.
   *
   * Google counts quota per model. This budget is per provider, which is
   * stricter: reranking and generation share it, two requests a question.
   */
  gemini: { requestsPerMinute: 10, tokensPerMinute: 200_000, maxTokensPerRequest: 30_000 },
};

// ---------------------------------------------------------------------------
// Corpus sources. An allowlist, never a scan: what gets published is a decision
// taken here, not a consequence of what happens to be in an account.
// ---------------------------------------------------------------------------

export interface GithubSource {
  owner: string;
  repo: string;
  /** Why this repository is in the corpus. Also the blurb shown with a citation. */
  why: string;
}

export const CORPUS_SOURCES = {
  github: [
    {
      owner: "Shubham-afk-del",
      repo: "LR_Delivery_Time_Prediction_-Shubham-Kumar-Singh-",
      why: "Delivery-time regression. The notebook behind the case study of the same name.",
    },
    {
      owner: "Shubham-afk-del",
      repo: "EDA_Optimising_NYC_Taxis_Shubham_Kumar_Singh",
      why: "NYC taxi exploratory analysis, including the placeholder-data correction.",
    },
    {
      owner: "Shubham-afk-del",
      repo: "Notes_App_AE2",
      why: "Web Services coursework. Small, and the only JavaScript on the profile.",
    },
    {
      owner: "Shubham-afk-del",
      repo: "Fraudulent_Claim_Detection",
      why: "Insurance fraud classification: logistic regression against a tuned random forest.",
    },
    {
      owner: "Shubham-afk-del",
      repo: "Predicting_Employee_Retention",
      why: "Employee retention: logistic regression with RFE, read through its odds ratios.",
    },
    {
      owner: "Shubham-afk-del",
      repo: "SQL_Farmers_Insurance_Analysis",
      why: "Crop insurance analysis in MySQL, and the only SQL on the profile.",
    },
    // Deliberately absent: University-Assignment--Community-Vaccination-Tracker.
    // It is a fork, and which lines are the owner's cannot be established from
    // the repository. Ingesting it would let the assistant answer questions
    // about code he may not have written, which is the one thing this system
    // must never do. INTAKE §8 asks for the same thing from the other side:
    // make the contribution explicit in its README, or un-fork it.
  ] satisfies GithubSource[],

  /** Extensions worth retrieving. Everything else in a tree is ignored. */
  githubExtensions: [".md", ".py", ".ipynb", ".js", ".ts", ".sql", ".html", ".css"],

  /** Paths that never carry signal, however they are named. */
  githubIgnore: [
    "node_modules/",
    ".git/",
    "__MACOSX/",
    "dist/",
    "build/",
    "package-lock.json",
  ],

  /** A file larger than this is a dataset or a build artifact, not prose. */
  githubMaxFileBytes: 400_000,

  /**
   * Notebooks get their own, much larger cap. A notebook is mostly base64
   * image output, so its file size says nothing about how much prose and code
   * it holds: the two analysis notebooks are 5.2MB and 3.3MB and carry the
   * most substantial work in the corpus. The loader strips the images, so what
   * actually gets embedded is a fraction of what gets downloaded.
   */
  notebookMaxFileBytes: 12_000_000,

  /**
   * Cell outputs are kept but truncated. The numbers in a notebook live in its
   * stdout, so dropping outputs entirely would lose the R² values that make
   * these repositories worth retrieving. Images are dropped.
   */
  notebookMaxOutputChars: 600,
} as const;

// ---------------------------------------------------------------------------
// Retrieval. Each flag corresponds to a row in the ablation table.
// ---------------------------------------------------------------------------

export type ChunkStrategy = "fixed" | "structural";

export interface RetrievalConfig {
  /** Ablation row 1 vs 2. */
  chunkStrategy: ChunkStrategy;
  chunkTokens: { min: number; max: number };
  /** Row 5: prepend an LLM-generated situating blurb before embedding. */
  contextualiseChunks: boolean;
  /** Row 3: retrieve the precise chunk, send the enclosing section. */
  parentExpansion: boolean;
  /** Row 4: lexical BM25 alongside dense, fused with RRF. */
  hybrid: boolean;
  rrfK: number;
  /**
   * Okapi BM25's two parameters, at the textbook values. k1: how fast repeats
   * of a term stop adding score. b: how strongly a long chunk is discounted
   * for its length. Sweepable like everything else here.
   */
  bm25: { k1: number; b: number };
  /** Row 6. */
  rerank: boolean;
  /**
   * How many fused candidates the reranker grades. Its cost, in tokens and in
   * latency, grows linearly with this, and nothing below it can be returned.
   */
  rerankCandidates: number;
  /** Row 7: filters extracted by the query rewriter. */
  metadataFilters: boolean;
  /** Row 8 (Phase 9): learned projection over frozen embeddings. */
  embeddingAdapter: boolean;

  denseTopK: number;
  lexicalTopK: number;
  finalTopK: number;
  /** Stops one long case study crowding out the rest of the corpus. */
  maxChunksPerDocument: number;
  /**
   * Below this, refuse instead of generating. Two scales, because ablation
   * rows 0 to 5 run without a reranker and still need a gate: cosine
   * similarity when reranking is off, the reranker's 0 to 1 score when it is
   * on. Both are tuned on the golden set.
   */
  relevanceThreshold: { similarity: number; rerank: number };
  /** Agent may re-search this many times within one turn. */
  maxSearchHops: number;
}

/** The shipping configuration. Update only with an eval number to justify it. */
export const RETRIEVAL_CONFIG: RetrievalConfig = {
  chunkStrategy: "structural",
  chunkTokens: { min: 300, max: 800 },
  contextualiseChunks: true,
  parentExpansion: true,
  hybrid: true,
  rrfK: 60,
  bm25: { k1: 1.2, b: 0.75 },
  rerank: true,
  rerankCandidates: 20,
  metadataFilters: true,
  embeddingAdapter: false,

  denseTopK: 40,
  lexicalTopK: 40,
  finalTopK: 8,
  maxChunksPerDocument: 3,
  // TODO(owner): set both from the Phase 4 sweep, not by feel. On the
  // reranker's scale 0.5 sits between its grades 1 and 2: something retrieved
  // has to answer at least part of the question.
  relevanceThreshold: { similarity: 0.35, rerank: 0.5 },
  maxSearchHops: 3,
};

/** Named variants for the ablation runner. Row 0 is the no-retrieval baseline. */
export const ABLATIONS: Record<string, Partial<RetrievalConfig>> = {
  "0-no-retrieval": { denseTopK: 0, lexicalTopK: 0, hybrid: false, rerank: false },
  "1-dense-fixed": {
    chunkStrategy: "fixed", hybrid: false, rerank: false,
    parentExpansion: false, contextualiseChunks: false, metadataFilters: false,
  },
  "2-dense-structural": {
    hybrid: false, rerank: false, parentExpansion: false,
    contextualiseChunks: false, metadataFilters: false,
  },
  "3-parent-expansion": {
    hybrid: false, rerank: false, contextualiseChunks: false, metadataFilters: false,
  },
  "4-hybrid-rrf": { rerank: false, contextualiseChunks: false, metadataFilters: false },
  "5-contextualised": { rerank: false, metadataFilters: false },
  "6-rerank": { metadataFilters: false },
  "7-metadata-filters": {},
  "8-embedding-adapter": { embeddingAdapter: true },
};

// ---------------------------------------------------------------------------
// Generation and guardrails
// ---------------------------------------------------------------------------

export const GENERATION = {
  maxTokens: 500, // also keeps us inside a 10s serverless wall-clock limit
  /**
   * 0, down from 0.3, after one question asked three times on 9 Oct 2026 got
   * a refusal once and a misspelled university name once: sampling noise a
   * factual assistant should not have. Phase 4 measures it properly.
   */
  temperature: 0,
  judgeTemperature: 0, // judges must be deterministic
} as const;

export const GUARDS = {
  maxInputChars: 1500,
  maxJdChars: 6000,
  maxHistoryTurns: 20,
  /** Below this the trained classifier defers to the LLM classifier. */
  classifierConfidenceFloor: 0.7,
  /** Cache hit when an incoming query is this close to a cached one. */
  semanticCacheSimilarity: 0.97,
  /** Escalation dedupe against pending and answered questions. */
  escalationDedupeSimilarity: 0.93,
  /**
   * A request body past this is not a conversation: the client resends the
   * whole history each turn, and a long one runs to tens of kilobytes.
   */
  maxRequestBytes: 512_000,
  rateLimits: {
    messagesPer10Min: 20,
    /**
     * Questions answered site-wide per Gemini quota day (lib/guards/rate-limit.ts).
     * Each question is two Flash-Lite requests out of about 500 a day, and the
     * evals draw on the same key, so 200 leaves room for a run and for retries.
     */
    questionsPerDay: 200,
    fitChecksPerHour: 5,
    escalationsPerSession: 3,
    escalationsPerDay: 20,
  },
} as const;

export const PERFORMANCE_BUDGET = {
  ttftP50Ms: 800,
  ttftP95Ms: 1500,
  fullAnswerP50Ms: 3000,
  cachedAnswerMs: 200,
} as const;

/** Evals are noisy. Single-run numbers are not reportable. */
export const EVAL = {
  seedsExploratory: 1,
  seedsPublished: 3,
  seeds: [11, 23, 37],
  recallRegressionPoints: 2, // CI fails if recall@10 drops more than this
} as const;
