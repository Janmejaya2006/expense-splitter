import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

const filesToVerify = [
  path.join(process.cwd(), "app", "api", "groups", "[id]", "expenses", "route.js"),
  path.join(process.cwd(), "app", "api", "groups", "[id]", "settlements", "notify", "route.js"),
];

test("sensitive write routes enforce rate limiting with retry headers", async () => {
  for (const filePath of filesToVerify) {
    const source = await fs.readFile(filePath, "utf8");
    const rel = path.relative(process.cwd(), filePath);

    assert.ok(source.includes("consumeRateLimit("), `${rel} should consume rate limits`);
    assert.ok(source.includes("\"Retry-After\""), `${rel} should include Retry-After headers`);
    assert.ok(source.includes("status: 429"), `${rel} should return HTTP 429 when throttled`);
  }
});
