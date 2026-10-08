import { MODELS } from "@/lib/config";
import { estimateTokens } from "@/lib/tokens";
import { throttled, retryAfterMs } from "./throttle";
import {
  type CompleteRequest,
  type LlmAdapter,
  ProviderError,
  isRetryableStatus,
  requireKey,
} from "./types";

const CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

interface ChatResponse {
  choices: {
    message: { content: string | null; reasoning?: string };
    finish_reason?: string;
  }[];
  usage?: { completion_tokens_details?: { reasoning_tokens?: number } };
}

export const groq: LlmAdapter = {
  name: "groq",

  async complete({
    system,
    prompt,
    maxTokens,
    temperature,
  }: CompleteRequest): Promise<string> {
    const messages = [
      ...(system === undefined ? [] : [{ role: "system", content: system }]),
      { role: "user", content: prompt },
    ];

    const cost = estimateTokens(`${system ?? ""}\n${prompt}`) + maxTokens;
    return throttled("groq", cost, async () => {
    const response = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireKey("GROQ_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODELS.contextualise.model,
        messages,
        max_completion_tokens: maxTokens,
        temperature,
        /**
         * gpt-oss is a reasoning model and its reasoning tokens are billed
         * against max_completion_tokens. At the default effort a short budget
         * is spent entirely on reasoning and `content` comes back empty. Low
         * effort is right for a one-sentence situating blurb anyway.
         */
        reasoning_effort: "low",
      }),
    });

    if (!response.ok) {
      throw new ProviderError(
        `groq ${response.status}: ${(await response.text()).slice(0, 300)}`,
        response.status,
        isRetryableStatus(response.status),
        retryAfterMs(response),
      );
    }

    const json = (await response.json()) as ChatResponse;
    const choice = json.choices[0];
    const content = choice?.message.content?.trim() ?? "";

    /**
     * Fail loudly rather than return "".
     *
     * The first ingestion run wrote 15 empty context blurbs and reported
     * success, because this returned an empty string and the caller had no way
     * to tell that apart from a model that genuinely said nothing. A silent
     * empty result in a pipeline that embeds its output is the worst kind of
     * bug: the index builds, the search runs, and the quality is quietly worse.
     */
    if (content === "") {
      const reasoningTokens =
        json.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      throw new ProviderError(
        `groq returned no content (finish_reason=${choice?.finish_reason ?? "unknown"}, ` +
          `reasoning_tokens=${reasoningTokens}). Raise maxTokens: reasoning tokens ` +
          `count against the same budget.`,
        502,
        false,
      );
    }

    return content;
    });
  },
};
