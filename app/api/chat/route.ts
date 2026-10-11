import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { GUARDS } from "@/lib/config";
import { streamAnswer } from "@/lib/generation/answer";
import { classifyScope } from "@/lib/generation/scope";
import { questionLimiter, visitorOf } from "@/lib/guards/rate-limit";
import type { ChatTurn } from "@/lib/llm";
import { getProfile } from "@/lib/profile";
import { retrieve } from "@/lib/retrieval/pipeline";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Retrieval, then a generated answer grounded in what it found.
 *
 * A question goes through the same retrieval pipeline the search CLI and the
 * evals use (lib/retrieval/pipeline.ts); the trace and the sources stream to
 * the client first, then the answer, written by lib/generation/answer.ts from
 * the profile and the passages that passed the relevance gate. Beside
 * retrieval, a scope check decides whether the question is about him at all
 * (lib/generation/scope.ts); it is faster than retrieval, so it adds no wait.
 *
 * The answer evals (evals/answers.ts) are the gate this route ships behind:
 * on 11 Oct 2026, 74 of 77 golden questions passed every check, faithfulness
 * was 1.000 with no unsupported claim, and every injection was resisted. The
 * three misses were the judge's labels, not wrong answers.
 */

interface IncomingMessage {
  role: string;
  parts?: { type: string; text?: string }[];
}

/**
 * A browsable GitHub link for an ingested file. Index paths read
 * "github:owner/repo/path/to/file", and GitHub serves files under
 * /blob/<ref>/; HEAD resolves to the default branch, so this does not need
 * to know whether a repository uses main or master.
 */
function githubUrl(path: string): string | undefined {
  if (!path.startsWith("github:")) return undefined;
  const [owner, repo, ...file] = path.slice("github:".length).split("/");
  if (owner === undefined || repo === undefined || file.length === 0) return undefined;
  return `https://github.com/${owner}/${repo}/blob/HEAD/${file.map(encodeURIComponent).join("/")}`;
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

/** Every turn before the question being answered, as plain text. */
function historyBefore(messages: IncomingMessage[]): ChatTurn[] {
  const lastUser = messages.map((message) => message.role).lastIndexOf("user");
  return messages.slice(0, Math.max(lastUser, 0)).flatMap((message) => {
    if (message.role !== "user" && message.role !== "assistant") return [];
    const text = (message.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text ?? "")
      .join(" ")
      .trim();
    return text === "" ? [] : [{ role: message.role, text }];
  });
}

const UNAVAILABLE =
  "The answer service didn't respond just now, so there's no written answer this time. " +
  "The sources below are what it would have drawn on, and the résumé is the authoritative record.";

const CUT_OFF = " … The answer was cut off here; the sources below are what it was drawing on.";

/** A reply written by the route itself, streamed like an answer so the chat shows it as one. */
function notice(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "notice";
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

function minutes(seconds: number): string {
  const whole = Math.max(1, Math.ceil(seconds / 60));
  return `${String(whole)} minute${whole === 1 ? "" : "s"}`;
}

export async function POST(request: Request): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > GUARDS.maxRequestBytes) {
    return new Response("Request too large.", { status: 413 });
  }
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

  // Checked after the question is known to be valid, so a malformed request
  // does not spend a visitor's allowance. Refusals come back as a reply in
  // the chat, not an error, so the visitor reads why and what to do instead.
  const verdict = questionLimiter.admit(visitorOf(request));
  if (!verdict.allowed) {
    return notice(
      verdict.reason === "visitor"
        ? `That's a lot of questions in a few minutes, so I'm taking a short pause. Try again in about ${minutes(verdict.retryAfterSeconds)}. His résumé, under Download résumé, has the full record in the meantime.`
        : "I've answered as many questions as I can for today. Please come back tomorrow; his résumé, under Download résumé, has the full record in the meantime.",
    );
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const history = historyBefore(body.messages ?? []);
      const [result, scope] = await Promise.all([
        retrieve(question, { interactive: true }),
        classifyScope(getProfile().preferred_name, question, history),
      ]);
      for (const reason of result.degraded) console.warn(`retrieval degraded: ${reason}`);

      /**
       * Every stage the pipeline ran, in order, with its measured time.
       * SPEC-v2 §13 asks for a trace panel; making it the loading state means
       * the wait is spent showing the work rather than spinning, and every
       * number in it is measured rather than staged.
       */
      writer.write({
        type: "data-trace",
        data: {
          stages: result.stages,
          chunks: result.corpus.chunks,
          documents: result.corpus.documents,
        },
      });

      writer.write({
        type: "data-sources",
        data: {
          // A passage the reranker graded 0 is unrelated to the question, and
          // listing it under an answer, or under "not on file", only adds noise.
          hits: result.hits.filter((hit) => hit.relevance !== 0).map((hit) => ({
            id: hit.chunkId,
            title: hit.title,
            docType: hit.docType,
            score: hit.similarity,
            relevance: hit.relevance,
            path: hit.path,
            url: githubUrl(hit.path),
            snippet: hit.content.replace(/\s+/g, " ").slice(0, 180),
          })),
          threshold: result.gate.threshold,
          scale: result.gate.scale,
        },
      });

      const id = "answer";
      writer.write({ type: "text-start", id });
      let wrote = false;
      try {
        const answer = await streamAnswer({ question, history, retrieval: result, scope });
        for await (const delta of answer) {
          writer.write({ type: "text-delta", id, delta });
          wrote = true;
        }
      } catch (error) {
        console.warn(`generation failed: ${String(error)}`);
        writer.write({ type: "text-delta", id, delta: wrote ? CUT_OFF : UNAVAILABLE });
      }
      writer.write({ type: "text-end", id });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
