import { MODELS, RETRIEVAL_CONFIG, type RetrievalConfig } from "@/lib/config";
import { embed, rerank } from "@/lib/llm";
import { getProfile } from "@/lib/profile";
import { cosine, loadIndex } from "./index-store";
import { bm25Search, chunkText, type LexicalHit } from "./lexical";
import type { CorpusChunk, CorpusDocument, CorpusIndex } from "./types";

/**
 * The retrieval pipeline: one function, used by the search CLI, the chat
 * route and (Phase 3) the eval harness, so all three measure the same thing.
 *
 *   embed → dense ─┐
 *                  ├→ fuse (RRF) → rerank → cap per document → top k → relevance gate
 *   BM25 ──────────┘
 *
 * Every option comes from a RetrievalConfig, never a literal, because the
 * ablation study in Phase 4 is a sweep over exactly these switches. Each
 * stage is timed, and the timings are what the chat's trace panel shows.
 */

export interface StageTiming {
  id: string;
  label: string;
  ms: number;
}

export interface RetrievedHit {
  chunkId: string;
  documentId: string;
  sectionId: string;
  title: string;
  path: string;
  docType: string;
  content: string;
  /**
   * Cosine similarity to the question, for every hit, including ones only
   * BM25 found. Without a reranker this is what the gate and the interface
   * use: a fused RRF score only says where something ranked, while
   * similarity means the same thing from one question to the next.
   */
  similarity: number;
  /**
   * The reranker's grade, 0 to 1, when reranking ran. It takes over from
   * similarity as the order and as the gate's measure, because similarity
   * says a passage is about the same thing, and the grade says whether it
   * answers the question.
   */
  relevance?: number;
  /** 1-based positions in each ranking that contributed, for the trace. */
  denseRank?: number;
  lexicalRank?: number;
  bm25?: number;
}

export interface RetrievalResult {
  hits: RetrievedHit[];
  stages: StageTiming[];
  /** Whether anything retrieved is close enough to answer from, judged on which scale. */
  gate: { passed: boolean; best: number; threshold: number; scale: "similarity" | "rerank" };
  /**
   * Stages that failed and were skipped, each with its reason. The chat
   * carries on without them. The eval harness must count a degraded result
   * as an error, or its numbers describe a different pipeline from the one
   * they claim to measure.
   */
  degraded: string[];
  corpus: { chunks: number; documents: number };
}

/**
 * Reciprocal Rank Fusion: every ranking gives each item 1 / (k + rank).
 * Ranks rather than scores, because cosine similarity and BM25 live on
 * unrelated scales and normalising one onto the other is guesswork. k = 60
 * is the value from the original paper (Cormack et al., 2009); it keeps the
 * top of one list from drowning out agreement further down the other.
 */
export function reciprocalRankFusion(
  rankings: readonly (readonly string[])[],
  k: number,
): Map<string, number> {
  const fused = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, position) => {
      fused.set(id, (fused.get(id) ?? 0) + 1 / (k + position + 1));
    });
  }
  return fused;
}

/** What the reranker reads for a chunk: where it comes from, then what was embedded. */
function rerankText(
  chunk: CorpusChunk,
  document: CorpusDocument | undefined,
  contextualised: boolean,
): string {
  const source = document === undefined ? "" : `${document.title} (${document.docType})\n`;
  return source + chunkText(chunk, contextualised);
}

/**
 * Tells an LLM reranker whose questions these are. The corpus is written in
 * the first person and the questions arrive in the third, and a grader has to
 * bridge that to see that "I left because" answers "why did they leave".
 */
function rerankContext(index: CorpusIndex): string {
  const { name } = getProfile();
  const kinds = [...new Set(index.documents.map((document) => document.docType))].join(", ");
  return (
    `Every question is about ${name} and usually comes from a recruiter. ` +
    `The passages are ${name}'s own documents (${kinds}), mostly written in the first person, ` +
    `while questions use the name or the third person, so a passage that says "I" can answer them.`
  );
}

/**
 * Question embeddings already made by this server, by exact text. Visitors
 * click the same suggested questions, and every embedding spends one of the
 * three Voyage requests a minute the free tier allows.
 */
const queryVectors = new Map<string, readonly number[]>();
const QUERY_VECTORS_KEPT = 256;

/**
 * How long a visitor's question waits for a Voyage slot. Past this, keyword
 * search and the reranker answer without the dense half: measured on 11 Oct
 * 2026, the fourth question inside a minute otherwise waited 50 seconds for
 * its embedding.
 */
const INTERACTIVE_EMBED_WAIT_MS = 2_500;

export async function retrieve(
  question: string,
  options: {
    config?: RetrievalConfig;
    index?: CorpusIndex;
    /** Reuse an embedding already made, so comparing configs costs one API call. */
    queryVector?: readonly number[];
    /**
     * A visitor is waiting (the chat route). Embedding gets a short wait cap
     * instead of the batch retry schedule, and a failed embedding degrades to
     * keyword search instead of failing the question.
     */
    interactive?: boolean;
  } = {},
): Promise<RetrievalResult> {
  const config = options.config ?? RETRIEVAL_CONFIG;
  const index = options.index ?? loadIndex();
  const stages: StageTiming[] = [];
  const degraded: string[] = [];
  const corpus = { chunks: index.chunks.length, documents: index.documents.length };

  const time = async <T>(id: string, label: string, run: () => T | Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await run();
    } finally {
      // Recorded when a stage fails too: a slow failure is what a trace is for.
      stages.push({ id, label, ms: Math.round(performance.now() - started) });
    }
  };

  // Ablation row 0: no retrieval at all, and no API call to find that out.
  if (config.denseTopK <= 0 && (!config.hybrid || config.lexicalTopK <= 0)) {
    return {
      hits: [],
      stages,
      gate: {
        passed: false,
        best: 0,
        threshold: config.relevanceThreshold.similarity,
        scale: "similarity",
      },
      degraded,
      corpus,
    };
  }

  let vector = options.queryVector ?? queryVectors.get(question);
  if (vector === undefined) {
    try {
      vector = await time("embed", "embedding the question", async () => {
        const { vectors } = await embed({
          input: [question],
          inputType: "query",
          ...(options.interactive === true ? { maxWaitMs: INTERACTIVE_EMBED_WAIT_MS } : {}),
        });
        const first = vectors[0];
        if (first === undefined) throw new Error("no embedding returned");
        return first;
      });
      queryVectors.set(question, vector);
      const oldest = queryVectors.keys().next().value;
      if (queryVectors.size > QUERY_VECTORS_KEPT && oldest !== undefined) queryVectors.delete(oldest);
    } catch (error) {
      if (options.interactive !== true) throw error;
      degraded.push(`embed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Dense: cosine against every chunk. Brute force is sub-millisecond at
  // this size (ARCHITECTURE.md §2), and it gives every chunk a similarity,
  // which the gate needs even for chunks only BM25 found. Without an
  // embedding there is no dense half, and keyword search ranks alone.
  const queryVector = vector;
  const similarity =
    queryVector === undefined
      ? new Map<string, number>()
      : await time(
          "dense",
          `dense search over ${String(corpus.chunks)} passages`,
          () => new Map(index.chunks.map((chunk) => [chunk.id, cosine(queryVector, chunk.embedding)])),
        );
  const denseRanking = [...similarity]
    .sort((a, b) => b[1] - a[1])
    .slice(0, config.denseTopK)
    .map(([id]) => id);

  let lexical: LexicalHit[] = [];
  let ranking = denseRanking;
  if (config.hybrid) {
    lexical = await time("lexical", "keyword search (BM25)", () =>
      bm25Search(index, question, config.lexicalTopK, {
        ...config.bm25,
        contextualised: config.contextualiseChunks,
      }),
    );
    ranking = await time("fuse", `fusing both rankings (RRF, k=${String(config.rrfK)})`, () =>
      [...reciprocalRankFusion([denseRanking, lexical.map((hit) => hit.chunkId)], config.rrfK)]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id),
    );
  }

  const chunks = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
  const documents = new Map(index.documents.map((document) => [document.id, document]));

  // Rerank: grade the head of the ranking against the question itself. Only
  // graded passages go forward, so rerankCandidates bounds what can be
  // returned. If the reranker fails, the fused order stands and the result
  // says so, rather than the question going unanswered.
  const relevance = new Map<string, number>();
  if (config.rerank && ranking.length > 0) {
    const candidates = ranking.slice(0, config.rerankCandidates).flatMap((id) => {
      const chunk = chunks.get(id);
      return chunk === undefined ? [] : [chunk];
    });
    const label = `grading ${String(candidates.length)} passages (${MODELS.rerank.model})`;
    try {
      const graded = await time("rerank", label, () =>
        rerank({
          query: question,
          documents: candidates.map((chunk) =>
            rerankText(chunk, documents.get(chunk.documentId), config.contextualiseChunks),
          ),
          topK: candidates.length,
          context: rerankContext(index),
        }),
      );
      ranking = graded.flatMap(({ index: position, score }) => {
        const chunk = candidates[position];
        if (chunk === undefined) return [];
        relevance.set(chunk.id, score);
        return [chunk.id];
      });
    } catch (error) {
      degraded.push(`rerank: ${error instanceof Error ? error.message : String(error)}`);
      const stage = stages[stages.length - 1];
      if (stage?.id === "rerank") stage.label = `${label}: failed, kept the fused order`;
    }
  }

  // Diversity: one long document must not crowd out the rest of the corpus.
  const picked = await time(
    "cap",
    `at most ${String(config.maxChunksPerDocument)} passages per document`,
    () => {
      const perDocument = new Map<string, number>();
      const kept: string[] = [];
      for (const id of ranking) {
        const chunk = chunks.get(id);
        if (chunk === undefined) continue;
        const count = perDocument.get(chunk.documentId) ?? 0;
        if (count >= config.maxChunksPerDocument) continue;
        perDocument.set(chunk.documentId, count + 1);
        kept.push(id);
        if (kept.length >= config.finalTopK) break;
      }
      return kept;
    },
  );

  const densePosition = new Map(denseRanking.map((id, i) => [id, i + 1]));
  const lexicalPosition = new Map(lexical.map((hit, i) => [hit.chunkId, { rank: i + 1, score: hit.score }]));

  const hits: RetrievedHit[] = picked.flatMap((id) => {
    const chunk = chunks.get(id);
    if (chunk === undefined) return [];
    const document = documents.get(chunk.documentId);
    const lexicalHit = lexicalPosition.get(id);
    return [
      {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        sectionId: chunk.sectionId,
        title: document?.title ?? chunk.documentId,
        path: document?.path ?? "",
        docType: document?.docType ?? "",
        content: chunk.content,
        similarity: similarity.get(id) ?? 0,
        relevance: relevance.get(id),
        denseRank: densePosition.get(id),
        lexicalRank: lexicalHit?.rank,
        bm25: lexicalHit?.score,
      },
    ];
  });

  // Provisional: both thresholds are set from the eval set in Phase 4. A
  // failed rerank falls back to the similarity scale with the fused order.
  const reranked = relevance.size > 0;
  const threshold = reranked
    ? config.relevanceThreshold.rerank
    : config.relevanceThreshold.similarity;
  const best = hits.reduce(
    (max, hit) => Math.max(max, (reranked ? hit.relevance : hit.similarity) ?? 0),
    0,
  );
  return {
    hits,
    stages,
    gate: { passed: best >= threshold, best, threshold, scale: reranked ? "rerank" : "similarity" },
    degraded,
    corpus,
  };
}
