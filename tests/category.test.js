import test from "node:test";
import assert from "node:assert/strict";
import { detectExpenseCategory } from "../lib/category.js";

test("detectExpenseCategory maps food keywords", () => {
  const category = detectExpenseCategory({ title: "Zomato dinner order" });
  assert.equal(category, "Food");
});

test("detectExpenseCategory falls back to misc when no match", () => {
  const category = detectExpenseCategory({ title: "Random purchase", notes: "unknown" });
  assert.equal(category, "Misc");
});

