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
}

export interface RerankRequest {
  query: string;
  documents: readonly string[];
  topK: number;
}

export interface RerankResult {
  index: number;
  score: number;
}

export interface LlmAdapter {
  readonly name: string;
  embed?(request: EmbedRequest): Promise<EmbedResult>;
  complete?(request: CompleteRequest): Promise<string>;
  rerank?(request: RerankRequest): Promise<RerankResult[]>;
}

/** Thrown when a provider refuses in a way a failover should respond to. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
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
