import { PROVIDER_LIMITS } from "@/lib/config";
import { ProviderError } from "./types";

/**
 * Client-side rate limiting, per provider.
 *
 * Retrying after a 429 is not enough when the limit is 3 requests a minute:
 * the backoff schedule has to be longer than the window, and burning the quota
 * to discover it is a waste of a cap that is already the binding constraint.
 * So requests are spaced before they are sent, and a rolling token window
 * holds the per-minute budget.
 *
 * Serialised per provider. Ingestion is a batch job where finishing matters
 * more than concurrency, and the free tiers are too narrow for parallelism to
 * buy anything anyway.
 */

interface Spend {
  at: number;
  tokens: number;
}

const WINDOW_MS = 60_000;

const queues = new Map<string, Promise<unknown>>();
const spends = new Map<string, Spend[]>();

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function recent(provider: string): Spend[] {
  const cutoff = Date.now() - WINDOW_MS;
  const kept = (spends.get(provider) ?? []).filter((spend) => spend.at > cutoff);
  spends.set(provider, kept);
  return kept;
}

/** How long to wait before a request of this size may be sent. */
function waitFor(provider: string, tokens: number): number {
  const limit = PROVIDER_LIMITS[provider];
  if (limit === undefined) return 0;

  const window = recent(provider);
  const now = Date.now();
  let wait = 0;

  // Requests per minute.
  if (window.length >= limit.requestsPerMinute) {
    const oldest = window[window.length - limit.requestsPerMinute];
    if (oldest !== undefined) wait = Math.max(wait, oldest.at + WINDOW_MS - now);
  }

  // Tokens per minute.
  const spent = window.reduce((total, spend) => total + spend.tokens, 0);
  if (spent + tokens > limit.tokensPerMinute) {
    let freed = 0;
    for (const spend of window) {
      freed += spend.tokens;
      if (spent - freed + tokens <= limit.tokensPerMinute) {
        wait = Math.max(wait, spend.at + WINDOW_MS - now);
        break;
      }
    }
  }

  return Math.max(0, wait);
}

/**
 * Runs `work` once the provider's budget allows it. Calls to the same provider
 * queue behind each other.
 *
 * `maxWaitMs` is for a caller with a visitor waiting on it: when the queue and
 * the budget together would hold the call longer than that, it fails at once
 * instead, without spending the budget, and the caller does without.
 */
export function throttled<T>(
  provider: string,
  tokens: number,
  work: () => Promise<T>,
  maxWaitMs = Infinity,
): Promise<T> {
  const previous = queues.get(provider) ?? Promise.resolve();
  const queued = Date.now();

  const next = previous.then(async () => {
    const wait = waitFor(provider, tokens);
    if (Date.now() - queued + wait > maxWaitMs) {
      throw new ProviderError(
        `${provider} rate limit: the next request slot is ${(wait / 1000).toFixed(1)}s away`,
        429,
        false,
      );
    }
    if (wait > 0) {
      console.log(`  waiting ${(wait / 1000).toFixed(1)}s for the ${provider} rate limit`);
      await sleep(wait);
    }
    spends.set(provider, [...recent(provider), { at: Date.now(), tokens }]);
    return work();
  });

  // Keep the chain alive even when a call rejects.
  queues.set(
    provider,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

/** Honours a Retry-After header when the provider sends one. */
export function retryAfterMs(response: Response): number | undefined {
  const header = response.headers.get("retry-after");
  if (header === null) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}
