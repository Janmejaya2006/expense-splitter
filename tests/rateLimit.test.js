import test from "node:test";
import assert from "node:assert/strict";
import { consumeRateLimit } from "../lib/rateLimit.js";

test("consumeRateLimit blocks once limit is exceeded", () => {
  const key = `test-rate-${Date.now()}-${Math.random()}`;
  const first = consumeRateLimit({ key, limit: 1, windowMs: 5_000, blockDurationMs: 10_000 });
  const second = consumeRateLimit({ key, limit: 1, windowMs: 5_000, blockDurationMs: 10_000 });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.ok(second.retryAfterMs > 0);
});
