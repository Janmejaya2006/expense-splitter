import test from "node:test";
import assert from "node:assert/strict";
import { findPotentialDuplicateExpense } from "../lib/expenseDuplicates.js";

test("findPotentialDuplicateExpense matches same payer amount title participants in date window", () => {
  const existing = [
    {
      id: 18,
      title: "Dinner at Marina",
      amount: 1250,
      payerMemberId: 7,
      participants: [7, 11, 13],
      expenseDate: "2026-04-03",
      createdAt: "2026-04-03T18:20:00.000Z",
    },
  ];

  const duplicate = findPotentialDuplicateExpense(existing, {
    title: "  dinner   at marina ",
    amount: 1250,
    payerMemberId: 7,
    participants: [13, 11, 7],
    expenseDate: "2026-04-02",
  });

  assert.ok(duplicate);
  assert.equal(duplicate.id, 18);
});

test("findPotentialDuplicateExpense ignores same title and amount outside the date window", () => {
  const existing = [
    {
      id: 21,
      title: "Rent",
      amount: 24000,
      payerMemberId: 9,
      participants: [9, 12],
      expenseDate: "2026-02-01",
      createdAt: "2026-02-01T08:00:00.000Z",
    },
  ];

  const duplicate = findPotentialDuplicateExpense(existing, {
    title: "Rent",
    amount: 24000,
    payerMemberId: 9,
    participants: [9, 12],
    expenseDate: "2026-04-01",
  });

  assert.equal(duplicate, null);
});
