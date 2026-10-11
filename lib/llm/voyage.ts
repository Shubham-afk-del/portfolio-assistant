import { MODELS, PROVIDER_LIMITS } from "@/lib/config";
import { estimateTokens } from "@/lib/tokens";
import { throttled, retryAfterMs } from "./throttle";
import {
  type EmbedRequest,
  type EmbedResult,
  type LlmAdapter,
  type RerankRequest,
  type RerankResult,
  ProviderError,
  isRetryableStatus,
  requireKey,
} from "./types";

const EMBED_URL = "https://api.voyageai.com/v1/embeddings";
const RERANK_URL = "https://api.voyageai.com/v1/rerank";

/**
 * Batches are bounded by tokens, not by item count. The free tier allows 10K
 * tokens a minute, so a 96-item batch of 400-token chunks is a single request
 * that cannot succeed. maxTokensPerRequest leaves headroom over the estimate.
 */
function batchByTokens(input: readonly string[], budget: number): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let tokens = 0;

  for (const item of input) {
    const cost = estimateTokens(item);
    if (current.length > 0 && tokens + cost > budget) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(item);
    tokens += cost;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

interface VoyageEmbedResponse {
  data: { embedding: number[] }[];
  usage?: { total_tokens?: number };
}

interface VoyageRerankResponse {
  data: { index: number; relevance_score: number }[];
}

async function post<T>(url: string, body: unknown, tokens: number, maxWaitMs?: number): Promise<T> {
  return throttled("voyage", tokens, async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireKey("VOYAGE_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new ProviderError(
        `voyage ${response.status}: ${(await response.text()).slice(0, 200)}`,
        response.status,
        isRetryableStatus(response.status),
        retryAfterMs(response),
      );
    }

    return (await response.json()) as T;
  }, maxWaitMs);
}

export const voyage: LlmAdapter = {
  name: "voyage",

  async embed({ input, inputType, maxWaitMs }: EmbedRequest): Promise<EmbedResult> {
    const vectors: number[][] = [];
    let tokens = 0;

    const budget = PROVIDER_LIMITS["voyage"]?.maxTokensPerRequest ?? 7_000;
    const batches = batchByTokens(input, budget);

    for (const batch of batches) {
      const json = await post<VoyageEmbedResponse>(
        EMBED_URL,
        { input: batch, model: MODELS.embed.model, input_type: inputType },
        batch.reduce((total, item) => total + estimateTokens(item), 0),
        maxWaitMs,
      );

      for (const row of json.data) {
        if (row.embedding.length !== MODELS.embed.dimensions) {
          throw new Error(
            `expected ${MODELS.embed.dimensions} dimensions from ${MODELS.embed.model}, got ${row.embedding.length}`,
          );
        }
        vectors.push(row.embedding);
      }
      tokens += json.usage?.total_tokens ?? 0;
    }

    return { vectors, tokens };
  },

  // No `context`: a cross-encoder scores each (query, passage) pair as it is.
  async rerank({ query, documents, topK }: RerankRequest): Promise<RerankResult[]> {
    const json = await post<VoyageRerankResponse>(
      RERANK_URL,
      { query, documents, model: MODELS.rerank.model, top_k: topK },
      documents.reduce((total, doc) => total + estimateTokens(doc), estimateTokens(query)),
    );
    return json.data.map((row) => ({ index: row.index, score: row.relevance_score }));
  },
};
