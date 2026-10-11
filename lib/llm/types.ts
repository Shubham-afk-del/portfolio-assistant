/**
 * One interface, several adapters.
 *
 * ZERO-COST-STACK §5 requires this and it is not over-engineering at £0: free
 * catalogues churn. Two models named in lib/config.ts were deleted by their
 * provider within three weeks of being written down. A model id reachable from
 * one file is a config change; a model id spread through the call sites is an
 * outage discovered by a visitor.
 */

export interface EmbedRequest {
  input: readonly string[];
  /** Voyage scores queries and documents differently. */
  inputType: "document" | "query";
  /**
   * Set when a visitor is waiting: the longest the request may queue for the
   * rate limit. Past it the call fails at once, with no retries.
   */
  maxWaitMs?: number;
}

export interface EmbedResult {
  vectors: number[][];
  tokens: number;
}

export interface CompleteRequest {
  system?: string;
  prompt: string;
  maxTokens: number;
  temperature: number;
  /** Defaults to the contextualise stage's model, the first caller. */
  model?: string;
  /** For a caller that cannot wait long, such as the scope check on a visitor's question. */
  signal?: AbortSignal;
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface GenerateRequest {
  /** Which model, and its thinking level. lib/llm picks it, from MODELS. */
  model: { model: string; thinking: string };
  system: string;
  /** The conversation so far, oldest first, ending with the turn to answer. */
  turns: readonly ChatTurn[];
  maxTokens: number;
  temperature: number;
}

export interface JsonRequest {
  /** Which model, and its thinking level. lib/llm picks it, from MODELS. */
  model: { model: string; thinking: string };
  system: string;
  prompt: string;
  /** A JSON Schema the reply must satisfy; the provider enforces it. */
  schema: object;
  maxTokens: number;
  temperature: number;
}

export interface RerankRequest {
  query: string;
  documents: readonly string[];
  topK: number;
  /**
   * Who the questions are about and what the documents are. An LLM reranker
   * reads it; a cross-encoder scores (query, passage) pairs and ignores it.
   */
  context?: string;
}

export interface RerankResult {
  /** Position in the request's `documents`. */
  index: number;
  /** 0 to 1, higher is more relevant. Comparable only within one reranker. */
  score: number;
}

export interface LlmAdapter {
  readonly name: string;
  embed?(request: EmbedRequest): Promise<EmbedResult>;
  complete?(request: CompleteRequest): Promise<string>;
  /**
   * Resolves once the provider has accepted the request, so a refusal can be
   * retried; the answer then arrives through the iterable as it is written.
   */
  stream?(request: GenerateRequest): Promise<AsyncIterable<string>>;
  rerank?(request: RerankRequest): Promise<RerankResult[]>;
  /** One reply, constrained to a schema and parsed. The caller validates the shape. */
  json?(request: JsonRequest): Promise<unknown>;
}

/** Thrown when a provider refuses in a way a failover should respond to. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    /** From the provider's Retry-After header, when it sends one. */
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function requireKey(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** 429 and 5xx are worth failing over for; 4xx is our own bug. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
