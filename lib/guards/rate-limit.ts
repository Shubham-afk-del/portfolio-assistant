import { GUARDS } from "@/lib/config";

/**
 * Limits on questions, per visitor and for the whole site.
 *
 * Every question spends free-tier quota that every visitor shares: two
 * Gemini requests (the rerank and the answer) out of about 500 a day, one
 * Voyage embedding out of three a minute, and one Groq scope check. Without
 * a limit, one person pasting questions in a loop, or one bot, could spend
 * the day's Gemini quota in minutes, and every recruiter after them would
 * get "the answer service didn't respond" until it reset.
 *
 * Two limits, then. Per visitor, the spec's 20 questions in any 10 minutes
 * (GUARDS.rateLimits.messagesPer10Min), which no person reading the answers
 * comes near. For the site, a daily ceiling below the Gemini quota, counted
 * on Google's own day (it resets at midnight Pacific time), so the ceiling
 * and the quota roll over together.
 *
 * Held in this server's memory. On Vercel each running instance keeps its
 * own counts, so the limits are best-effort: enough to stop a loop or a
 * casual script, not a determined distributed attack. A shared store
 * (Upstash Redis has a free tier) would make them exact; this module is the
 * one place that would change.
 */

const WINDOW_MS = 10 * 60_000;

/** Visitors remembered at most; past this, ones with nothing in the window are forgotten. */
const VISITORS_KEPT = 5_000;

export type Verdict =
  | { allowed: true }
  | { allowed: false; reason: "visitor" | "site"; retryAfterSeconds: number };

export interface Limits {
  perVisitor: number;
  perDay: number;
}

const DEFAULT_LIMITS: Limits = {
  perVisitor: GUARDS.rateLimits.messagesPer10Min,
  perDay: GUARDS.rateLimits.questionsPerDay,
};

/** Google's quota day: the date in Pacific time, as YYYY-MM-DD. */
function quotaDay(now: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(now);
}

/**
 * Seconds until the quota day changes, to within 15 minutes: stepped forward
 * until the Pacific date moves on. Only ever shown rounded to hours, and it
 * stays right across daylight-saving changes, which arithmetic on a fixed
 * offset would not.
 */
function secondsToNextQuotaDay(now: number): number {
  const today = quotaDay(now);
  let probe = now;
  for (let i = 0; i < 100 && quotaDay(probe) === today; i += 1) probe += 15 * 60_000;
  return Math.max(60, Math.round((probe - now) / 1000));
}

export interface RateLimiter {
  admit: (visitor: string, now?: number) => Verdict;
}

/** A limiter with its own counts; the chat route uses the shared one below. */
export function createRateLimiter(limits: Limits = DEFAULT_LIMITS): RateLimiter {
  const visitors = new Map<string, number[]>();
  let day = "";
  let answeredToday = 0;

  const forgetIdle = (now: number): void => {
    for (const [key, times] of visitors) {
      if ((times[times.length - 1] ?? 0) <= now - WINDOW_MS) visitors.delete(key);
    }
  };

  return {
    admit(visitor, now = Date.now()) {
      const currentDay = quotaDay(now);
      if (currentDay !== day) {
        day = currentDay;
        answeredToday = 0;
      }
      if (answeredToday >= limits.perDay) {
        return { allowed: false, reason: "site", retryAfterSeconds: secondsToNextQuotaDay(now) };
      }

      const recent = (visitors.get(visitor) ?? []).filter((time) => time > now - WINDOW_MS);
      if (recent.length >= limits.perVisitor) {
        const oldest = recent[0] ?? now;
        visitors.set(visitor, recent);
        return {
          allowed: false,
          reason: "visitor",
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
        };
      }

      recent.push(now);
      visitors.set(visitor, recent);
      answeredToday += 1;
      if (visitors.size > VISITORS_KEPT) forgetIdle(now);
      return { allowed: true };
    },
  };
}

export const questionLimiter = createRateLimiter();

/**
 * Who is asking, as far as a rate limit needs to know: the client address
 * Vercel puts first in x-forwarded-for, which it overwrites at its edge so a
 * client cannot forge it. Locally there is no proxy, and every question is
 * one visitor's.
 */
export function visitorOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}
