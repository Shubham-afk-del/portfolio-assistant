/**
 * Retrieval metrics, at document level.
 *
 * The golden set labels documents, not chunks: a chunk id changes whenever
 * the chunking does (ablation row 1 re-chunks the whole corpus), while
 * "decision 002 answers this" stays true. So every function here takes the
 * document id of each retrieved chunk, in rank order, duplicates included,
 * and k counts chunks, as the pipeline returns them.
 *
 * Relevance is graded. `required` documents are the ones a good retrieval
 * must find, and recall counts only those. `acceptable` documents also
 * answer the question (a notebook beside its case study, say) without being
 * required: ranking one first is a good result, so MRR and hit@k credit
 * them, and nDCG gives them half a required document's gain. Without that
 * grade, the first run scored the reranker down for preferring primary
 * sources the golden set had not listed.
 */

export interface Relevance {
  required: readonly string[];
  acceptable: readonly string[];
}

/** The share of expected documents with at least one chunk in the top k. */
export function recallAtK(retrieved: readonly string[], expected: readonly string[], k: number): number {
  if (expected.length === 0) return 0;
  const top = new Set(retrieved.slice(0, k));
  return expected.filter((id) => top.has(id)).length / expected.length;
}

function relevant(relevance: Relevance, id: string): boolean {
  return relevance.required.includes(id) || relevance.acceptable.includes(id);
}

/** 1 when any relevant document has a chunk in the top k, else 0. */
export function hitAtK(retrieved: readonly string[], relevance: Relevance, k: number): number {
  return retrieved.slice(0, k).some((id) => relevant(relevance, id)) ? 1 : 0;
}

/** 1 / the rank of the first chunk from a relevant document, or 0 if none is in the top k. */
export function reciprocalRank(retrieved: readonly string[], relevance: Relevance, k: number): number {
  const index = retrieved.slice(0, k).findIndex((id) => relevant(relevance, id));
  return index === -1 ? 0 : 1 / (index + 1);
}

/** A required document's gain is 1 and an acceptable one's half that. */
const ACCEPTABLE_GAIN = 0.5;

/**
 * Graded nDCG@k. Each relevant document earns its gain once, at its first
 * chunk, so three chunks of one document do not count as three results. The
 * ideal ranking puts every required document first, then the acceptable.
 */
export function ndcgAtK(retrieved: readonly string[], relevance: Relevance, k: number): number {
  const gain = (id: string): number =>
    relevance.required.includes(id) ? 1 : relevance.acceptable.includes(id) ? ACCEPTABLE_GAIN : 0;
  const credited = new Set<string>();
  let dcg = 0;
  retrieved.slice(0, k).forEach((id, index) => {
    if (gain(id) === 0 || credited.has(id)) return;
    credited.add(id);
    dcg += gain(id) / Math.log2(index + 2);
  });
  const gains = [
    ...relevance.required.map(() => 1),
    ...relevance.acceptable.map(() => ACCEPTABLE_GAIN),
  ].slice(0, k);
  const ideal = gains.reduce((sum, value, index) => sum + value / Math.log2(index + 2), 0);
  return ideal === 0 ? 0 : dcg / ideal;
}

export function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Sample standard deviation; 0 for fewer than two values. */
export function std(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

/** Nearest-rank percentile, p from 0 to 100. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? 0;
}
