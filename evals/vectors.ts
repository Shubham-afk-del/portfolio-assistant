import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { MODELS } from "@/lib/config";
import { embed } from "@/lib/llm";

/**
 * Query embeddings for the golden questions, cached in evals/cache/ and keyed
 * by question for the configured embedding model. Shared by both runners.
 */

const CACHE = join(process.cwd(), "evals", "cache", "query-embeddings.json");

interface EmbeddingCache {
  model: string;
  vectors: Record<string, number[]>;
}

/**
 * One vector per question. Missing ones are embedded together, so a new
 * batch of questions spends one request of Voyage's three a minute and a
 * repeat run spends none. A change of model empties the cache.
 */
export async function queryVectors(questions: readonly string[]): Promise<Map<string, number[]>> {
  let cache: EmbeddingCache = { model: MODELS.embed.model, vectors: {} };
  if (existsSync(CACHE)) {
    const stored = JSON.parse(readFileSync(CACHE, "utf8")) as EmbeddingCache;
    if (stored.model === MODELS.embed.model) cache = stored;
  }

  const missing = [...new Set(questions)].filter((question) => cache.vectors[question] === undefined);
  if (missing.length > 0) {
    console.log(`embedding ${String(missing.length)} question(s) in one request`);
    const { vectors } = await embed({ input: missing, inputType: "query" });
    missing.forEach((question, i) => {
      const vector = vectors[i];
      if (vector !== undefined) cache.vectors[question] = vector;
    });
    mkdirSync(dirname(CACHE), { recursive: true });
    writeFileSync(CACHE, JSON.stringify(cache));
  }

  return new Map(
    questions.flatMap((question) => {
      const vector = cache.vectors[question];
      return vector === undefined ? [] : [[question, vector] as const];
    }),
  );
}
