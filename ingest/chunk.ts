import { createHash } from "node:crypto";
import { RETRIEVAL_CONFIG } from "@/lib/config";
import { estimateTokens } from "@/lib/tokens";
import type { CorpusChunk, CorpusSection } from "@/lib/retrieval/types";

export { estimateTokens };

export function hash(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 16);
}

interface Split {
  heading: string;
  body: string;
}

/**
 * Split markdown on its headings. Everything before the first heading belongs
 * to an implicit opening section, which is where a document's framing usually
 * lives.
 */
function splitOnHeadings(markdown: string): Split[] {
  const lines = markdown.split("\n");
  const splits: Split[] = [];
  let heading = "";
  let body: string[] = [];
  let inFence = false;

  const flush = (): void => {
    const text = body.join("\n").trim();
    if (text !== "" || heading !== "") splits.push({ heading, body: text });
    body = [];
  };

  for (const line of lines) {
    if (line.trimStart().startsWith("```")) inFence = !inFence;

    const match = inFence ? null : /^(#{1,6})\s+(.*)$/.exec(line);
    if (match !== null) {
      flush();
      heading = match[2]?.trim() ?? "";
      continue;
    }
    body.push(line);
  }
  flush();

  return splits.filter((split) => split.body !== "");
}

/**
 * Break a section that exceeds the maximum into paragraph-aligned pieces.
 * A fenced code block is never split, even when that overshoots the maximum:
 * half a code block retrieves worse than a long one.
 */
function splitLongSection(body: string, maxTokens: number): string[] {
  if (estimateTokens(body) <= maxTokens) return [body];

  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const paragraph of body.split(/\n{2,}/)) {
    const fences = (paragraph.match(/```/g) ?? []).length;
    const wouldOverflow =
      !inFence &&
      current.length > 0 &&
      estimateTokens([...current, paragraph].join("\n\n")) > maxTokens;

    if (wouldOverflow) {
      blocks.push(current.join("\n\n"));
      current = [];
    }

    current.push(paragraph);
    if (fences % 2 === 1) inFence = !inFence;
  }

  if (current.length > 0) blocks.push(current.join("\n\n"));
  return blocks;
}

/** What the chunker can know. The blurb, its hash and the vector come later. */
export type RawChunk = Omit<
  CorpusChunk,
  "embedding" | "contextBlurb" | "embedHash"
>;

export interface ChunkedDocument {
  sections: CorpusSection[];
  chunks: RawChunk[];
}

/**
 * Structural chunking (ablation row 2 onwards). Sections come from the
 * document's own headings, so a chunk boundary falls where the author put one.
 * Short adjacent sections merge until they clear the minimum, because a
 * 40-token chunk embeds to noise.
 */
export function chunkDocument(documentId: string, markdown: string): ChunkedDocument {
  const { chunkTokens } = RETRIEVAL_CONFIG;
  const splits = splitOnHeadings(markdown);

  const merged: Split[] = [];
  for (const split of splits) {
    const previous = merged[merged.length - 1];
    const tooShort =
      previous !== undefined &&
      estimateTokens(previous.body) < chunkTokens.min &&
      estimateTokens(`${previous.body}\n\n${split.body}`) <= chunkTokens.max;

    if (tooShort) {
      previous.body = `${previous.body}\n\n${split.heading === "" ? "" : `## ${split.heading}\n\n`}${split.body}`;
      continue;
    }
    merged.push({ ...split });
  }

  const sections: CorpusSection[] = [];
  const chunks: RawChunk[] = [];

  merged.forEach((split, ord) => {
    const sectionId = `${documentId}#${ord}`;
    sections.push({
      id: sectionId,
      documentId,
      heading: split.heading,
      content: split.body,
      ord,
    });

    splitLongSection(split.body, chunkTokens.max).forEach((piece, index) => {
      chunks.push({
        id: `${sectionId}:${index}`,
        documentId,
        sectionId,
        content: piece,
        tokenCount: estimateTokens(piece),
        contentHash: hash(piece, split.heading),
      });
    });
  });

  return { sections, chunks };
}
