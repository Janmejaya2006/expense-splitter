function round2(value) {
  return Number((Number(value || 0) + Number.EPSILON).toFixed(2));
}

export function simplifyDebts(balances = []) {
  const normalizedBalances = Array.isArray(balances)
    ? balances.map((item) => ({
        memberId: Number(item?.memberId || 0),
        name: String(item?.name || "Member"),
        net: round2(Number(item?.net || 0)),
      }))
    : [];

  const creditors = normalizedBalances
    .filter((item) => item.net > 0.01)
    .map((item) => ({ ...item }))
    .sort((a, b) => b.net - a.net);

  const debtors = normalizedBalances
    .filter((item) => item.net < -0.01)
    .map((item) => ({ ...item, debt: round2(Math.abs(item.net)) }))
    .sort((a, b) => b.debt - a.debt);

  const totalOutstanding = round2(
    debtors.reduce((sum, item) => sum + Number(item.debt || 0), 0)
  );

  const settlements = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = round2(Math.min(debtor.debt, creditor.net));

    if (amount > 0) {
      settlements.push({
        fromMemberId: debtor.memberId,
        fromName: debtor.name,
        toMemberId: creditor.memberId,
        toName: creditor.name,
        amount,
      });
    }

    debtor.debt = round2(debtor.debt - amount);
    creditor.net = round2(creditor.net - amount);

    if (debtor.debt <= 0.01) i += 1;
    if (creditor.net <= 0.01) j += 1;
  }

  const naiveTransactionCount = debtors.length * creditors.length;
  const simplifiedTransactionCount = settlements.length;
  const transactionsSaved = Math.max(0, naiveTransactionCount - simplifiedTransactionCount);

  return {
    settlements,
    stats: {
      creditorCount: creditors.length,
      debtorCount: debtors.length,
      naiveTransactionCount,
      simplifiedTransactionCount,
      transactionsSaved,
      totalOutstanding,
    },
  };
}
