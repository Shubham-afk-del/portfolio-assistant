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
  /** Final answer generation. Quality matters most here. */
  generate: { provider: "gemini" as Provider, model: "gemini-flash-latest" },
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
  /** Eval judge. Kept separate so it can be upgraded independently of generation. */
  judge: { provider: "gemini" as Provider, model: "gemini-flash-latest" },
  embed: { provider: "voyage" as Provider, model: "voyage-3-large", dimensions: 1024 },
  rerank: { provider: "voyage" as Provider, model: "rerank-2" },
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
  /** Row 6. */
  rerank: boolean;
  /** Row 7: filters extracted by the query rewriter. */
  metadataFilters: boolean;
  /** Row 8 (Phase 9): learned projection over frozen embeddings. */
  embeddingAdapter: boolean;

  denseTopK: number;
  lexicalTopK: number;
  finalTopK: number;
  /** Stops one long case study crowding out the rest of the corpus. */
  maxChunksPerDocument: number;
  /** Below this reranked score, refuse instead of generating. Tuned on the golden set. */
  relevanceThreshold: number;
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
  rerank: true,
  metadataFilters: true,
  embeddingAdapter: false,

  denseTopK: 40,
  lexicalTopK: 40,
  finalTopK: 8,
  maxChunksPerDocument: 3,
  relevanceThreshold: 0.35, // TODO(owner): set from the Phase 4 sweep, not by feel
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
  temperature: 0.3,
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
  rateLimits: {
    messagesPer10Min: 20,
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
