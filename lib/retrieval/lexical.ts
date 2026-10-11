import type { CorpusChunk, CorpusIndex } from "./types";

/**
 * Lexical retrieval: Okapi BM25 over the same in-memory chunks the dense
 * search scores.
 *
 * Why it exists: recruiter questions are full of exact names, "ServiceNow",
 * "Tanium", "bcrypt", "R²", that an embedding can blur into their
 * neighbours. BM25 rewards the literal term. Fused with the dense ranking in
 * pipeline.ts, each covers the other's blind spot; ablation row 4 measures
 * whether that actually holds on this corpus.
 *
 * Hand-written rather than a library (ARCHITECTURE.md §2 originally named
 * MiniSearch): it is about sixty lines with the textbook formula, so every
 * number in it can be explained, and it indexes exactly the string that was
 * embedded rather than a library's idea of a document.
 *
 * Deliberately simple: no stemming, so "model" and "models" are different
 * terms. Whether stemming helps is a question for the ablation, not a default.
 */

/** Words too common to say anything about which chunk a question wants. */
const STOPWORDS = new Set(
  (
    "a an and are as at be been but by can could did do does for from had has have he her hers " +
    "him his how i if in into is it its me my of on or our she so than that the their them then " +
    "there these they this those to was we were what when where which who whom why will with " +
    "would you your about any tell"
  ).split(" "),
);

/**
 * Lowercased word tokens. A camelCase identifier also yields its parts, so a
 * question about "dense search" can match `denseSearch` in code; snake_case
 * splits on its own because underscores are not word characters.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const word of text.split(/[^\p{L}\p{N}]+/u)) {
    if (word === "") continue;
    const parts = word.split(/(?<=\p{Ll})(?=\p{Lu})/u);
    for (const part of parts.length > 1 ? [word, ...parts] : [word]) {
      const token = part.toLowerCase();
      if (STOPWORDS.has(token)) continue;
      // Single letters are noise; a single digit can be the whole point ("3 NF").
      if (token.length < 2 && !/\p{N}/u.test(token)) continue;
      tokens.push(token);
    }
  }
  return tokens;
}

/**
 * The text a chunk is matched on: exactly what was embedded for it. With
 * contextualised chunks that is the situating blurb plus the chunk, which
 * makes this "contextual BM25", and ablation row 5 switches both off together.
 */
export function chunkText(chunk: CorpusChunk, contextualised: boolean): string {
  return contextualised && chunk.contextBlurb !== ""
    ? `${chunk.contextBlurb}\n\n${chunk.content}`
    : chunk.content;
}

interface Posting {
  /** Position of the chunk in `ids`. */
  doc: number;
  /** How many times the term occurs in it. */
  tf: number;
}

interface Bm25Index {
  ids: string[];
  lengths: number[];
  averageLength: number;
  postings: Map<string, Posting[]>;
}

function buildIndex(chunks: readonly CorpusChunk[], contextualised: boolean): Bm25Index {
  const postings = new Map<string, Posting[]>();
  const lengths: number[] = [];

  chunks.forEach((chunk, doc) => {
    const tokens = tokenize(chunkText(chunk, contextualised));
    lengths.push(tokens.length);
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    for (const [term, tf] of counts) {
      const list = postings.get(term);
      if (list === undefined) postings.set(term, [{ doc, tf }]);
      else list.push({ doc, tf });
    }
  });

  const total = lengths.reduce((sum, length) => sum + length, 0);
  return {
    ids: chunks.map((chunk) => chunk.id),
    lengths,
    averageLength: lengths.length === 0 ? 0 : total / lengths.length,
    postings,
  };
}

/** Built once per loaded index and variant, like the index itself: per cold start. */
const built = new WeakMap<CorpusIndex, Map<boolean, Bm25Index>>();

function indexFor(index: CorpusIndex, contextualised: boolean): Bm25Index {
  let variants = built.get(index);
  if (variants === undefined) {
    variants = new Map();
    built.set(index, variants);
  }
  let bm25 = variants.get(contextualised);
  if (bm25 === undefined) {
    bm25 = buildIndex(index.chunks, contextualised);
    variants.set(contextualised, bm25);
  }
  return bm25;
}

export interface LexicalHit {
  chunkId: string;
  score: number;
}

/**
 * Okapi BM25:
 *
 *   score(q, d) = Σ over terms t in q of
 *                 idf(t) · tf·(k1 + 1) / (tf + k1·(1 − b + b·|d| / avg|d|))
 *
 *   idf(t) = ln(1 + (N − n_t + 0.5) / (n_t + 0.5))
 *
 * with Lucene's form of idf, which stays positive: a term that appears in
 * almost every chunk adds almost nothing rather than subtracting.
 */
export function bm25Search(
  index: CorpusIndex,
  query: string,
  topK: number,
  options: { k1: number; b: number; contextualised: boolean },
): LexicalHit[] {
  if (topK <= 0) return [];
  const bm25 = indexFor(index, options.contextualised);
  const total = bm25.ids.length;
  const scores = new Map<number, number>();

  for (const term of new Set(tokenize(query))) {
    const list = bm25.postings.get(term);
    if (list === undefined) continue;
    const idf = Math.log(1 + (total - list.length + 0.5) / (list.length + 0.5));
    for (const { doc, tf } of list) {
      const length = bm25.lengths[doc] ?? 0;
      const norm = tf + options.k1 * (1 - options.b + (options.b * length) / bm25.averageLength);
      scores.set(doc, (scores.get(doc) ?? 0) + (idf * tf * (options.k1 + 1)) / norm);
    }
  }

  return [...scores]
    .map(([doc, score]) => ({ chunkId: bm25.ids[doc] ?? "", score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
