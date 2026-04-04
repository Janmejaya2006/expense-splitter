const MS_IN_DAY = 24 * 60 * 60 * 1000;

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeParticipantIds(participants) {
  const ids = Array.isArray(participants) ? participants : [];
  const seen = new Set();
  const output = [];
  for (const raw of ids) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }
  output.sort((a, b) => a - b);
  return output;
}

function sameParticipants(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (Number(left[i]) !== Number(right[i])) return false;
  }
  return true;
}

function parseDate(value) {
  const ts = new Date(value || "").getTime();
  return Number.isFinite(ts) ? ts : null;
}

function withinDateWindow(leftTs, rightTs, maxDays) {
  if (!Number.isFinite(leftTs) || !Number.isFinite(rightTs)) return true;
  const delta = Math.abs(leftTs - rightTs);
  return delta <= maxDays * MS_IN_DAY;
}

export function findPotentialDuplicateExpense(expenses, candidate, options = {}) {
  const rows = Array.isArray(expenses) ? expenses : [];
  const normalizedTitle = normalizeText(candidate?.title);
  const payerMemberId = Number(candidate?.payerMemberId || 0);
  const amount = Number(candidate?.amount || 0);
  const participantIds = normalizeParticipantIds(candidate?.participants);
  const dateWindowDays = Math.max(0, Number(options.dateWindowDays || 3));
  const targetDateTs = parseDate(candidate?.expenseDate);

  if (!normalizedTitle) return null;
  if (!Number.isFinite(payerMemberId) || payerMemberId <= 0) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!participantIds.length) return null;

  const sortedRows = rows
    .filter((row) => row && typeof row === "object")
    .slice()
    .sort((left, right) => new Date(right?.createdAt || 0).getTime() - new Date(left?.createdAt || 0).getTime());

  for (const expense of sortedRows) {
    if (normalizeText(expense?.title) !== normalizedTitle) continue;
    if (Number(expense?.payerMemberId || 0) !== payerMemberId) continue;
    if (Math.abs(Number(expense?.amount || 0) - amount) > 0.01) continue;

    const expenseParticipants = normalizeParticipantIds(expense?.participants);
    if (!sameParticipants(expenseParticipants, participantIds)) continue;

    const existingDateTs = parseDate(expense?.expenseDate || expense?.createdAt);
    if (!withinDateWindow(existingDateTs, targetDateTs, dateWindowDays)) continue;

    return {
      id: Number(expense?.id || 0),
      title: String(expense?.title || ""),
      amount: Number(expense?.amount || 0),
      payerMemberId: Number(expense?.payerMemberId || 0),
      participants: expenseParticipants,
      expenseDate: String(expense?.expenseDate || ""),
      createdAt: String(expense?.createdAt || ""),
    };
  }

  return null;
}
