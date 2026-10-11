import assert from "node:assert/strict";
import { test } from "node:test";
import { createRateLimiter } from "./rate-limit";

const START = Date.UTC(2026, 9, 11, 15, 0, 0); // 08:00 in Los Angeles

test("a visitor may ask the limit's worth of questions in ten minutes, and no more", () => {
  const limiter = createRateLimiter({ perVisitor: 3, perDay: 100 });
  for (let i = 0; i < 3; i += 1) assert.deepEqual(limiter.admit("a", START + i * 1000), { allowed: true });
  const refused = limiter.admit("a", START + 5000);
  assert.equal(refused.allowed, false);
  assert.ok(!refused.allowed && refused.reason === "visitor");
  // The first question leaves the window ten minutes after it was asked.
  assert.ok(!refused.allowed && refused.retryAfterSeconds === 595);
});

test("one visitor's limit is not another's", () => {
  const limiter = createRateLimiter({ perVisitor: 1, perDay: 100 });
  assert.equal(limiter.admit("a", START).allowed, true);
  assert.equal(limiter.admit("a", START + 1).allowed, false);
  assert.equal(limiter.admit("b", START + 2).allowed, true);
});

test("questions leave the window after ten minutes", () => {
  const limiter = createRateLimiter({ perVisitor: 1, perDay: 100 });
  assert.equal(limiter.admit("a", START).allowed, true);
  assert.equal(limiter.admit("a", START + 9 * 60_000).allowed, false);
  assert.equal(limiter.admit("a", START + 10 * 60_000 + 1).allowed, true);
});

test("the site stops for the day at its ceiling, and opens again on Google's next day", () => {
  const limiter = createRateLimiter({ perVisitor: 100, perDay: 2 });
  assert.equal(limiter.admit("a", START).allowed, true);
  assert.equal(limiter.admit("b", START + 1).allowed, true);
  const refused = limiter.admit("c", START + 2);
  assert.ok(!refused.allowed && refused.reason === "site");
  // 08:00 in Los Angeles, so the quota day ends in about 16 hours.
  assert.ok(!refused.allowed && refused.retryAfterSeconds > 15.5 * 3600 && refused.retryAfterSeconds <= 16 * 3600);
  assert.equal(limiter.admit("c", START + 16 * 3600_000 + 60_000).allowed, true);
});

test("a refused question does not count against the visitor or the site", () => {
  const limiter = createRateLimiter({ perVisitor: 1, perDay: 2 });
  assert.equal(limiter.admit("a", START).allowed, true);
  assert.equal(limiter.admit("a", START + 1).allowed, false);
  assert.equal(limiter.admit("a", START + 2).allowed, false);
  assert.equal(limiter.admit("b", START + 3).allowed, true);
});
