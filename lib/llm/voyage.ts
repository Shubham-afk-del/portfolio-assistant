import { MODELS } from "@/lib/config";
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

/** Voyage caps a batch; ingestion stays well inside it but the loop is explicit. */
const BATCH = 96;

interface VoyageEmbedResponse {
  data: { embedding: number[] }[];
  usage?: { total_tokens?: number };
}

interface VoyageRerankResponse {
  data: { index: number; relevance_score: number }[];
}

async function post<T>(url: string, body: unknown): Promise<T> {
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
      `voyage ${response.status}: ${(await response.text()).slice(0, 300)}`,
      response.status,
      isRetryableStatus(response.status),
    );
  }

  return (await response.json()) as T;
}

export const voyage: LlmAdapter = {
  name: "voyage",

  async embed({ input, inputType }: EmbedRequest): Promise<EmbedResult> {
    const vectors: number[][] = [];
    let tokens = 0;

    for (let i = 0; i < input.length; i += BATCH) {
      const batch = input.slice(i, i + BATCH);
      const json = await post<VoyageEmbedResponse>(EMBED_URL, {
        input: batch,
        model: MODELS.embed.model,
        input_type: inputType,
      });

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

  async rerank({ query, documents, topK }: RerankRequest): Promise<RerankResult[]> {
    const json = await post<VoyageRerankResponse>(RERANK_URL, {
      query,
      documents,
      model: MODELS.rerank.model,
      top_k: topK,
    });
    return json.data.map((row) => ({ index: row.index, score: row.relevance_score }));
  },
};
