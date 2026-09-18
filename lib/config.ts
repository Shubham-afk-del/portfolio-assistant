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
  /** High-volume, latency-sensitive stages. */
  rewrite: { provider: "groq" as Provider, model: "llama-3.1-8b-instant" },
  contextualise: { provider: "groq" as Provider, model: "llama-3.1-8b-instant" },
  /** Fallback for the trained classifier's low-confidence band (Phase 6). */
  classify: { provider: "groq" as Provider, model: "llama-3.1-8b-instant" },
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
