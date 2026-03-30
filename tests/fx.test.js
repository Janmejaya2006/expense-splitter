import test from "node:test";
import assert from "node:assert/strict";
import { convertAmountToCurrency, normalizeCurrencyCode } from "../lib/fx.js";

test("normalizeCurrencyCode accepts valid 3-letter codes", () => {
  assert.equal(normalizeCurrencyCode("usd"), "USD");
  assert.equal(normalizeCurrencyCode("inr"), "INR");
  assert.equal(normalizeCurrencyCode("invalid", "EUR"), "EUR");
});

test("convertAmountToCurrency returns identity conversion for same currency", async () => {
  const result = await convertAmountToCurrency(125.5, "INR", "INR");
  assert.equal(result.sourceCurrency, "INR");
  assert.equal(result.targetCurrency, "INR");
  assert.equal(result.convertedAmount, 125.5);
  assert.equal(result.rate, 1);
});
