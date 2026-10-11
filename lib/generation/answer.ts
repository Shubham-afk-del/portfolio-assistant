import { GENERATION, GUARDS } from "@/lib/config";
import { stream, type ChatTurn } from "@/lib/llm";
import { getProfile } from "@/lib/profile";
import type { RetrievalResult, RetrievedHit } from "@/lib/retrieval/pipeline";
import { offTopicNote, systemPrompt, withPassages } from "./prompt";
import type { Scope } from "./scope";

/**
 * Generation: the profile in the system prompt, the passages that passed the
 * relevance gate in the question, and the conversation before it as context.
 * Shared by the chat route and, in Phase 3, the eval harness, so the answers
 * the evals judge are the answers visitors get.
 *
 * Only passages at or above the gate's threshold are sent: a passage the
 * reranker judged unhelpful is one the model would be tempted to cite anyway.
 *
 * When none pass, the model still gets the profile. That departs from SPEC-v2
 * §12's hard gate on purpose: the gate would refuse "where did he study?" for
 * want of a passage, when the answer is in the profile and was never in the
 * index. The system prompt makes the model say "not on file" when the profile
 * cannot answer either, and the eval set's unknown-fact cases test that it
 * does.
 *
 * A question the scope check found is not about him (scope.ts) is sent with
 * a note saying so beside it. Without a verdict, because the check failed or
 * was not run, the system prompt's own scope rule still applies.
 */
export function streamAnswer({
  question,
  history,
  retrieval,
  scope,
}: {
  question: string;
  history: readonly ChatTurn[];
  retrieval: RetrievalResult;
  scope: Scope | undefined;
}): Promise<AsyncIterable<string>> {
  return stream({
    system: systemPrompt(getProfile(), process.env["CONTACT_PHONE"]),
    turns: [
      ...alternating(history.slice(-GUARDS.maxHistoryTurns)),
      { role: "user", text: questionTurn(question, retrieval, scope) },
    ],
    maxTokens: GENERATION.maxTokens,
    temperature: GENERATION.temperature,
  });
}

/**
 * The visitor's turn exactly as the model receives it. Exported so the eval
 * judge checks an answer against exactly what its model saw.
 */
export function questionTurn(question: string, retrieval: RetrievalResult, scope: Scope | undefined): string {
  const note = scope === "general" ? offTopicNote(getProfile().preferred_name) : undefined;
  return withPassages(question, selectPassages(retrieval), note);
}

/**
 * The passages the model is given: those at or above the gate's threshold,
 * numbered as their source cards. Exported so the eval judge checks an
 * answer against exactly what its model saw.
 */
export function selectPassages(retrieval: RetrievalResult): { number: number; hit: RetrievedHit }[] {
  const { gate } = retrieval;
  return retrieval.hits.flatMap((hit, index) => {
    const score = gate.scale === "rerank" ? (hit.relevance ?? 0) : hit.similarity;
    return gate.passed && score >= gate.threshold ? [{ number: index + 1, hit }] : [];
  });
}

/**
 * Gemini wants a conversation that opens with the user and alternates. A
 * window cut from a longer history can start on a reply, and a turn whose
 * answer failed leaves two questions in a row, so both are tidied here: a
 * leading reply is dropped and consecutive turns from one side are merged.
 * The last turn is the visitor's, so the history must end on a reply.
 */
function alternating(turns: readonly ChatTurn[]): ChatTurn[] {
  const tidy: ChatTurn[] = [];
  for (const turn of turns) {
    if (turn.text.trim() === "") continue;
    const previous = tidy[tidy.length - 1];
    if (previous === undefined && turn.role === "assistant") continue;
    if (previous?.role === turn.role) previous.text = `${previous.text}\n\n${turn.text}`;
    else tidy.push({ role: turn.role, text: turn.text });
  }
  if (tidy[tidy.length - 1]?.role === "user") tidy.pop();
  return tidy;
}
