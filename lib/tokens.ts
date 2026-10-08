/**
 * Token count, approximated at four characters per token.
 *
 * A real tokeniser would be exact and would cost a dependency and a download
 * for a number used to decide where to split a chunk and how large a batch may
 * be. The error is a few percent on English prose. Where it matters, the
 * consumer leaves headroom rather than trusting it.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
