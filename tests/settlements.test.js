import test from "node:test";
import assert from "node:assert/strict";
import { simplifyDebts } from "../lib/settlements.js";

test("simplifyDebts creates direct settlement from net balances", () => {
  const result = simplifyDebts([
    { memberId: 1, name: "A", net: -50 },
    { memberId: 2, name: "B", net: 0 },
    { memberId: 3, name: "C", net: 50 },
  ]);

  assert.deepEqual(result.settlements, [
    {
      fromMemberId: 1,
      fromName: "A",
      toMemberId: 3,
      toName: "C",
      amount: 50,
    },
  ]);
  assert.equal(result.stats.totalOutstanding, 50);
});

test("simplifyDebts reports transaction savings against naive all-pairs transfers", () => {
  const result = simplifyDebts([
    { memberId: 1, name: "Debtor 1", net: -60 },
    { memberId: 2, name: "Debtor 2", net: -40 },
    { memberId: 3, name: "Creditor 1", net: 50 },
    { memberId: 4, name: "Creditor 2", net: 50 },
  ]);

  assert.equal(result.settlements.length, 3);
  assert.equal(result.stats.naiveTransactionCount, 4);
  assert.equal(result.stats.transactionsSaved, 1);
  assert.equal(result.stats.totalOutstanding, 100);
});
