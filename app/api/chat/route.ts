import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { embed } from "@/lib/llm";
import { loadIndex, denseSearch } from "@/lib/retrieval/index-store";
import { GUARDS, RETRIEVAL_CONFIG } from "@/lib/config";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Retrieval only. No generation yet.
 *
 * This route proves the whole path end to end: a question arrives, it is
 * embedded, searched against the committed index, and the real sources stream
 * back to the client. What it deliberately does not do is write prose about
 * them, because generation without the guardrails in SPEC-v2 §12 and the
 * faithfulness checks in §14 is exactly the thing this project exists not to
 * ship. The answer text says so rather than implying a model is thinking.
 *
 * Phase 3 replaces the placeholder paragraph with a generated, cited answer.
 */

interface IncomingMessage {
  role: string;
  parts?: { type: string; text?: string }[];
}

function lastUserText(messages: IncomingMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    return (message.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join(" ")
      .trim();
  }
  return "";
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { messages?: IncomingMessage[] };
  const question = lastUserText(body.messages ?? []);

  if (question === "") {
    return new Response("No question in the request.", { status: 400 });
  }
  if (question.length > GUARDS.maxInputChars) {
    return new Response(
      `Question is ${question.length} characters; the cap is ${GUARDS.maxInputChars}.`,
      { status: 413 },
    );
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const startedAt = Date.now();
      const index = loadIndex();
      const { vectors } = await embed({ input: [question], inputType: "query" });
      const embedMs = Date.now() - startedAt;

      const queryVector = vectors[0];
      if (queryVector === undefined) throw new Error("no embedding returned");

      const searchedAt = Date.now();
      const hits = denseSearch(index, queryVector, RETRIEVAL_CONFIG.finalTopK);
      const searchMs = Date.now() - searchedAt;

      /**
       * The trace is streamed as it happens, stage by stage, with the real
       * measured timings. SPEC-v2 §13 asks for a trace panel; making it the
       * loading state means the wait is spent showing the work rather than
       * spinning, and every number in it is measured rather than staged.
       */
      writer.write({
        type: "data-trace",
        data: {
          stages: [
            { id: "embed", label: "embedding the question", ms: embedMs },
            { id: "search", label: `searching ${String(index.chunks.length)} chunks`, ms: searchMs },
            { id: "rank", label: `ranking ${String(hits.length)} passages`, ms: 0 },
          ],
          chunks: index.chunks.length,
          documents: index.documents.length,
        },
      });

      writer.write({
        type: "data-sources",
        data: {
          hits: hits.map((hit) => ({
            id: hit.chunkId,
            title: hit.title,
            docType: hit.docType,
            score: hit.score,
            path: hit.path,
            url: hit.path.startsWith("github:")
              ? `https://github.com/${hit.path.slice("github:".length)}`
              : undefined,
            snippet: hit.content.replace(/\s+/g, " ").slice(0, 180),
          })),
          threshold: RETRIEVAL_CONFIG.relevanceThreshold,
        },
      });

      const id = "answer";
      writer.write({ type: "text-start", id });

      const best = hits[0];
      const body =
        best === undefined || best.score < RETRIEVAL_CONFIG.relevanceThreshold
          ? `Nothing in the corpus is close enough to answer that. Rather than ` +
            `generate something plausible, the honest answer is that it is not ` +
            `on file. The résumé is the authoritative record, and Shubham can be ` +
            `reached directly.`
          : `Retrieval found ${hits.length} relevant passages across ` +
            `${new Set(hits.map((hit) => hit.documentId)).size} documents, listed ` +
            `below with their similarity scores. Generation is not wired up yet: ` +
            `the eval harness that measures whether an answer is faithful to ` +
            `these sources is being built first, so this returns the evidence ` +
            `rather than prose about it. Embedding took ${embedMs}ms and the ` +
            `search ${searchMs}ms over ${index.chunks.length} chunks.`;

      for (const word of body.split(" ")) {
        writer.write({ type: "text-delta", id, delta: `${word} ` });
        await new Promise((resolve) => setTimeout(resolve, 18));
      }
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
