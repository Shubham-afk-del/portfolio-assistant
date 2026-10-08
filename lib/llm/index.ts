import { voyage } from "./voyage";
import { groq } from "./groq";
import {
  type CompleteRequest,
  type EmbedRequest,
  type EmbedResult,
  type RerankRequest,
  type RerankResult,
  ProviderError,
} from "./types";

export * from "./types";

/**
 * Retry on the failures worth retrying (429, 5xx) with exponential backoff.
 * Cross-provider failover per FAILOVER in lib/config.ts arrives in Phase 3,
 * when a second provider implements the same stage. There is no second
 * embedding provider in this build, so pretending to fail over would be
 * decoration.
 */
async function withRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  const delays = [500, 2000, 6000];
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof ProviderError && error.retryable;
      const delay = delays[attempt];
      if (!retryable || delay === undefined) break;
      console.warn(`  ${label} failed (${String(error)}), retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function embed(request: EmbedRequest): Promise<EmbedResult> {
  if (voyage.embed === undefined) throw new Error("voyage adapter has no embed");
  return withRetry("embed", () => voyage.embed!(request));
}

export function complete(request: CompleteRequest): Promise<string> {
  if (groq.complete === undefined) throw new Error("groq adapter has no complete");
  return withRetry("complete", () => groq.complete!(request));
}

export function rerank(request: RerankRequest): Promise<RerankResult[]> {
  if (voyage.rerank === undefined) throw new Error("voyage adapter has no rerank");
  return withRetry("rerank", () => voyage.rerank!(request));
}
