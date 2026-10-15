import { MODELS } from "@/lib/config";
import { gemini } from "./gemini";
import { voyage } from "./voyage";
import { groq } from "./groq";
import {
  type CompleteRequest,
  type EmbedRequest,
  type EmbedResult,
  type GenerateRequest,
  type JsonRequest,
  type RerankRequest,
  type RerankResult,
  ProviderError,
} from "./types";

export * from "./types";

/**
 * Ingestion and evals: long enough to outlast a one-minute window, because a
 * 3 RPM limit cannot be waited out in six seconds.
 */
const BATCH_DELAYS = [2_000, 10_000, 30_000, 65_000];

/**
 * A stage between a visitor's question and the first token. Better to skip
 * it, which the retrieval pipeline can, than to keep someone waiting on it.
 */
const INTERACTIVE_DELAYS = [1_000, 3_000];

/**
 * The eval judge: batch work against a model whose "high demand" refusals
 * come in bursts (on 10 Oct 2026, one request in three for minutes at a
 * time). Waiting out a burst is cheap; switching models mid-run would change
 * the instrument.
 */
const JUDGE_DELAYS = [5_000, 15_000, 45_000, 90_000, 180_000];

/**
 * Retry on the failures worth retrying (429, 5xx) with exponential backoff.
 * Cross-provider failover per FAILOVER in lib/config.ts arrives in Phase 3,
 * when a second provider implements the same stage. There is no second
 * embedding provider in this build, so pretending to fail over would be
 * decoration.
 *
 * A provider that asks for a longer wait than the schedule's longest step has
 * run out of a budget rather than hit a blip, so that ends the retries too.
 */
async function withRetry<T>(
  label: string,
  run: () => Promise<T>,
  delays: readonly number[] = BATCH_DELAYS,
): Promise<T> {
  const longest = Math.max(...delays);
  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const scheduled = delays[attempt];
      if (!(error instanceof ProviderError) || !error.retryable || scheduled === undefined) break;
      const delay = error.retryAfterMs ?? scheduled;
      if (delay > longest) break;
      console.warn(`  ${label} failed (${String(error)}), retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function embed(request: EmbedRequest): Promise<EmbedResult> {
  if (voyage.embed === undefined) throw new Error("voyage adapter has no embed");
  // A capped request has a visitor waiting on it: one attempt, no backoff.
  if (request.maxWaitMs !== undefined) return voyage.embed(request);
  return withRetry("embed", () => voyage.embed!(request));
}

export function complete(request: CompleteRequest): Promise<string> {
  if (groq.complete === undefined) throw new Error("groq adapter has no complete");
  return withRetry("complete", () => groq.complete!(request));
}

/**
 * The scope check on a visitor's question (lib/generation/scope.ts). One
 * attempt and no retries: it runs beside retrieval, and an answer must never
 * wait on a check whose failure only means falling back to the system
 * prompt's own scope rule.
 */
export function classify(request: Omit<CompleteRequest, "model">): Promise<string> {
  if (groq.complete === undefined) throw new Error("groq adapter has no complete");
  return groq.complete({ ...request, model: MODELS.classify.model });
}

/**
 * Whether another model is worth trying. Google counts quota per model, and
 * load too, so overload, a stream that never started and a quota that ran
 * out are all reasons to move on. A daily quota is not worth retrying on the
 * same model (gemini.ts marks it so), but it is exactly when the next model,
 * with a quota of its own, should answer.
 */
function worthAnotherModel(error: unknown): error is ProviderError {
  return error instanceof ProviderError && (error.retryable || error.status === 429);
}

/**
 * Retries cover the request being accepted, not the answer once it is
 * streaming: half an answer cannot be taken back from the visitor's screen.
 *
 * A refusal worth moving on from goes straight to the next model rather than
 * back to the same one, since an overloaded free model is more likely to stay
 * overloaded for the next second than to recover in it: Flash-Lite, then
 * Flash, then 3.1 Flash-Lite (lib/config.ts says why each).
 */
export async function stream(request: Omit<GenerateRequest, "model">): Promise<AsyncIterable<string>> {
  if (gemini.stream === undefined) throw new Error("gemini adapter has no stream");
  try {
    return await gemini.stream({ ...request, model: MODELS.generate });
  } catch (error) {
    if (!worthAnotherModel(error)) throw error;
    console.warn(`  generate falling back to ${MODELS.generateFallback.model} (${String(error)})`);
  }
  try {
    return await withRetry(
      "generate",
      () => gemini.stream!({ ...request, model: MODELS.generateFallback }),
      INTERACTIVE_DELAYS,
    );
  } catch (error) {
    if (!worthAnotherModel(error)) throw error;
    console.warn(`  generate falling back to ${MODELS.generateLastResort.model} (${String(error)})`);
  }
  return withRetry(
    "generate",
    () => gemini.stream!({ ...request, model: MODELS.generateLastResort }),
    INTERACTIVE_DELAYS,
  );
}

/**
 * The eval judge. Batch work, so it waits out a busy model with the longest
 * schedule rather than failing over: a judgement from a different model
 * would be a different instrument.
 */
export function judge(request: Omit<JsonRequest, "model">): Promise<unknown> {
  if (gemini.json === undefined) throw new Error("gemini adapter has no json");
  return withRetry("judge", () => gemini.json!({ ...request, model: MODELS.judge }), JUDGE_DELAYS);
}

export function rerank(request: RerankRequest): Promise<RerankResult[]> {
  const adapter = MODELS.rerank.provider === "gemini" ? gemini : voyage;
  if (adapter.rerank === undefined) throw new Error(`${adapter.name} adapter has no rerank`);
  return withRetry("rerank", () => adapter.rerank!(request), INTERACTIVE_DELAYS);
}
