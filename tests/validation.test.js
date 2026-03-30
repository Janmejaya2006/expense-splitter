import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { RequestValidationError, parseRequestBody, parseWithSchema } from "../lib/validation.js";

test("parseWithSchema returns sanitized payload", () => {
  const schema = z.object({
    name: z.string().trim().min(1),
  });

  const parsed = parseWithSchema(schema, { name: "  Trip  " });
  assert.deepEqual(parsed, { name: "Trip" });
});

test("parseWithSchema throws RequestValidationError for invalid payload", () => {
  const schema = z.object({
    amount: z.coerce.number().positive("Amount must be positive"),
  });

  assert.throws(
    () => parseWithSchema(schema, { amount: -5 }),
    (error) => {
      assert.equal(error instanceof RequestValidationError, true);
      assert.equal(error.message, "Amount must be positive");
      return true;
    }
  );
});

test("parseRequestBody throws on malformed json", async () => {
  const schema = z.object({ name: z.string() });
  const request = new Request("http://localhost:3000/api/test", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{bad json",
  });

  await assert.rejects(
    () => parseRequestBody(request, schema),
    (error) => {
      assert.equal(error instanceof RequestValidationError, true);
      assert.equal(error.message, "Invalid JSON payload");
      return true;
    }
  );
});
