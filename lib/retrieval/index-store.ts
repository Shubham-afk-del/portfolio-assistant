import { readFileSync } from "node:fs";
import { join } from "node:path";
import { INDEX_VERSION, type CorpusIndex } from "./types";
import { MODELS } from "@/lib/config";

/**
 * Loads the committed index into memory once per process, which on Vercel means
 * once per cold start. Brute-force cosine over a few hundred vectors is
 * sub-millisecond, so there is nothing to amortise beyond the file read.
 */
let cached: CorpusIndex | undefined;

export function loadIndex(repoRoot: string = process.cwd()): CorpusIndex {
  if (cached !== undefined) return cached;

  const path = join(repoRoot, "data", "index.json");
  const index = JSON.parse(readFileSync(path, "utf8")) as CorpusIndex;

  if (index.version !== INDEX_VERSION) {
    throw new Error(
      `data/index.json is version ${index.version}, this build expects ${INDEX_VERSION}. Re-run npm run ingest.`,
    );
  }
  if (index.embedModel !== MODELS.embed.model) {
    throw new Error(
      `data/index.json was built with ${index.embedModel}, config says ${MODELS.embed.model}. Re-run npm run ingest.`,
    );
  }

  cached = index;
  return index;
}

/**
 * Voyage returns unit-length vectors, so a dot product is the cosine. The norms
 * are divided out anyway: it costs nothing at this size and it means a change
 * of embedding provider cannot silently produce wrong scores.
 */
export function cosine(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dot / magnitude;
}

export interface DenseHit {
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  content: string;
  title: string;
  path: string;
  docType: string;
}

/** Dense retrieval only. BM25, RRF fusion and reranking are Phase 2. */
export function denseSearch(
  index: CorpusIndex,
  queryVector: readonly number[],
  topK: number,
): DenseHit[] {
  const documents = new Map(index.documents.map((doc) => [doc.id, doc]));

  return index.chunks
    .map((chunk) => {
      const document = documents.get(chunk.documentId);
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        sectionId: chunk.sectionId,
        score: cosine(queryVector, chunk.embedding),
        content: chunk.content,
        title: document?.title ?? chunk.documentId,
        path: document?.path ?? "",
        docType: document?.docType ?? "",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
