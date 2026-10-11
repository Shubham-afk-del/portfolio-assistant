import type { UIMessage } from "ai";

/** Shapes of the custom parts app/api/chat/route.ts streams before the text. */

export interface TraceStage {
  id: string;
  label: string;
  ms: number;
}

export interface TracePayload {
  stages: TraceStage[];
  chunks: number;
  documents: number;
}

export interface Hit {
  id: string;
  title: string;
  docType: string;
  /** Cosine similarity to the question. The knowledge map's halos show it. */
  score: number;
  /** The reranker's grade, 0 to 1, when reranking ran. */
  relevance?: number;
  path: string;
  url?: string;
  snippet: string;
}

export interface SourcesPayload {
  hits: Hit[];
  /** The relevance gate's threshold, on the scale `scale` names. */
  threshold: number;
  /** What the gate judged: similarity, or the reranker's grade. */
  scale: "similarity" | "rerank";
}

/**
 * Typing the data parts is what lets a component narrow
 * `part.type === "data-trace"` to its payload instead of casting.
 */
export type AssistantMessage = UIMessage<
  unknown,
  { trace: TracePayload; sources: SourcesPayload }
>;

export function textOf(message: AssistantMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
