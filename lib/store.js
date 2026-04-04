import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { simplifyDebts } from "@/lib/settlements";
import { DATA_DIR, DB_JSON_PATH, DB_SQLITE_PATH } from "./dataPaths.js";
import { publishRealtimeEvent } from "./realtime.js";
const APP_DB_BACKEND = String(process.env.APP_DB_BACKEND || "sqlite").trim().toLowerCase();

let writeQueue = Promise.resolve();
let sqliteDb = null;
let sqliteCtor = null;
let sqliteCtorLoaded = false;

const GROUP_SCOPED_COLLECTIONS = [
  "members",
  "expenses",
  "notificationLogs",
  "settlementPayments",
  "groupInvites",
  "recurringExpenses",
  "expenseComments",
  "activityLogs",
];

const requireModule = createRequire(import.meta.url);

function normalizeMemberRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "owner") return "owner";
  if (value === "admin") return "admin";
  return "member";
}

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;

  if (!sqliteCtorLoaded) {
    sqliteCtorLoaded = true;
    try {
      const sqlite = requireModule("node:sqlite");
      sqliteCtor = sqlite?.DatabaseSync || null;
    } catch {
      sqliteCtor = null;
    }
  }

  if (!sqliteCtor) {
    throw new Error("SQLITE_UNAVAILABLE");
  }

  sqliteDb = new sqliteCtor(DB_SQLITE_PATH);
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      json TEXT NOT NULL
    );
  `);

  return sqliteDb;
}

async function readJsonFileFallback() {
  try {
    const raw = await fs.readFile(DB_JSON_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readStateFromDisk() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  if (APP_DB_BACKEND === "sqlite") {
    try {
      const db = getSqliteDb();
      const row = db.prepare("SELECT json FROM app_state WHERE id = 1").get();

      if (row?.json) {
        try {
          return JSON.parse(String(row.json));
        } catch {
          return {};
        }
      }

      // First run: migrate existing db.json into SQLite if available.
      const fallback = await readJsonFileFallback();
      db.prepare("INSERT OR REPLACE INTO app_state (id, json) VALUES (1, ?)").run(JSON.stringify(fallback));
      return fallback;
    } catch {
      // Runtime does not support node:sqlite (or initialization failed), so fallback to JSON backend.
      return readJsonFileFallback();
    }
  }

  return readJsonFileFallback();
}

async function writeStateToDisk(data) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  if (APP_DB_BACKEND === "sqlite") {
    try {
      const db = getSqliteDb();
      db.prepare("INSERT OR REPLACE INTO app_state (id, json) VALUES (1, ?)").run(JSON.stringify(data));
      return;
    } catch {
      // Runtime does not support node:sqlite (or initialization failed), so fallback to JSON backend.
    }
  }

  await fs.writeFile(DB_JSON_PATH, JSON.stringify(data, null, 2));
}

function nextIdFrom(items) {
  const max = (items || []).reduce((acc, item) => {
    const value = Number(item?.id || 0);
    return Number.isFinite(value) && value > acc ? value : acc;
  }, 0);

  return max + 1;
}

function ensureDatabaseShape(input) {
  const db = input && typeof input === "object" ? input : {};

  db.meta = db.meta && typeof db.meta === "object" ? db.meta : {};
  db.groups = Array.isArray(db.groups) ? db.groups : [];
  db.members = Array.isArray(db.members) ? db.members : [];
  db.expenses = Array.isArray(db.expenses) ? db.expenses : [];
  db.users = Array.isArray(db.users) ? db.users : [];
  db.notificationLogs = Array.isArray(db.notificationLogs) ? db.notificationLogs : [];
  db.notificationQueue = Array.isArray(db.notificationQueue) ? db.notificationQueue : [];
  db.settlementPayments = Array.isArray(db.settlementPayments) ? db.settlementPayments : [];
  db.paymentMethods = Array.isArray(db.paymentMethods) ? db.paymentMethods : [];
  db.groupInvites = Array.isArray(db.groupInvites) ? db.groupInvites : [];
  db.passwordResetTokens = Array.isArray(db.passwordResetTokens) ? db.passwordResetTokens : [];
  db.emailVerificationTokens = Array.isArray(db.emailVerificationTokens) ? db.emailVerificationTokens : [];
  db.recurringExpenses = Array.isArray(db.recurringExpenses) ? db.recurringExpenses : [];
  db.expenseComments = Array.isArray(db.expenseComments) ? db.expenseComments : [];
  db.activityLogs = Array.isArray(db.activityLogs) ? db.activityLogs : [];
  db.webPushSubscriptions = Array.isArray(db.webPushSubscriptions) ? db.webPushSubscriptions : [];
  db.loginOtpChallenges = Array.isArray(db.loginOtpChallenges) ? db.loginOtpChallenges : [];

  for (const group of db.groups) {
    group.lastMonthlySummaryMonth = String(group.lastMonthlySummaryMonth || "");
    group.lastWeeklySummaryWeek = String(group.lastWeeklySummaryWeek || "");
  }

  for (const member of db.members) {
    member.role = normalizeMemberRole(member.role);
    const userId = Number(member.userId);
    member.userId = Number.isFinite(userId) && userId > 0 ? userId : null;
    member.phone = String(member.phone || "").trim();
    member.upiId = String(member.upiId || "").trim().toLowerCase();
  }

  for (const user of db.users) {
    user.phone = String(user.phone || "").trim();
    user.avatarUrl = String(user.avatarUrl || "").trim().slice(0, 400_000);
    user.emailVerifiedAt = user.emailVerifiedAt ? String(user.emailVerifiedAt) : null;
    user.emailVerificationSentAt = user.emailVerificationSentAt ? String(user.emailVerificationSentAt) : null;
    const authProvider = String(user.authProvider || "email").trim().toLowerCase();
    user.authProvider = authProvider === "google" ? "google" : "email";
    user.googleSub = String(user.googleSub || "").trim();
    const prefs = user.notificationPreferences && typeof user.notificationPreferences === "object"
      ? user.notificationPreferences
      : {};
    user.notificationPreferences = {
      email: prefs.email !== false,
      sms: Boolean(prefs.sms),
      whatsapp: Boolean(prefs.whatsapp),
      productUpdates: prefs.productUpdates !== false,
      settlementAlerts: prefs.settlementAlerts !== false,
      weeklySummary: prefs.weeklySummary !== false,
    };
    user.savedExpenseFilters = Array.isArray(user.savedExpenseFilters)
      ? user.savedExpenseFilters
          .map((item) => {
            const raw = item && typeof item === "object" ? item : {};
            const id = String(raw.id || "").trim();
            const name = String(raw.name || "").trim();
            const criteria = raw.criteria && typeof raw.criteria === "object" ? raw.criteria : {};
            const search = String(criteria.search || "").trim().slice(0, 200);
            const category = String(criteria.category || "").trim().slice(0, 80);
            const memberId = Number(criteria.memberId || 0);
            const dateFrom = String(criteria.dateFrom || "").trim();
            const dateTo = String(criteria.dateTo || "").trim();
            const minAmount = Number(criteria.minAmount);
            const maxAmount = Number(criteria.maxAmount);
            const createdAt = String(raw.createdAt || nowISO());
            const updatedAt = String(raw.updatedAt || createdAt);

            if (!id || !name) return null;
            return {
              id,
              name: name.slice(0, 80),
              criteria: {
                search,
                category,
                memberId: Number.isFinite(memberId) && memberId > 0 ? memberId : null,
                dateFrom: dateFrom || "",
                dateTo: dateTo || "",
                minAmount: Number.isFinite(minAmount) && minAmount >= 0 ? Number(minAmount) : null,
                maxAmount: Number.isFinite(maxAmount) && maxAmount >= 0 ? Number(maxAmount) : null,
              },
              createdAt,
              updatedAt,
            };
          })
          .filter(Boolean)
          .slice(0, 25)
      : [];
  }

  const groupCurrencyById = new Map(
    (db.groups || []).map((group) => {
      const code = String(group?.currency || "INR").trim().toUpperCase();
      return [Number(group?.id || 0), /^[A-Z]{3}$/.test(code) ? code : "INR"];
    })
  );

  for (const expense of db.expenses) {
    expense.groupId = Number(expense.groupId || 0);
    expense.amount = Number.isFinite(Number(expense.amount)) ? Number(expense.amount) : 0;
    expense.sourceAmount = Number.isFinite(Number(expense.sourceAmount))
      ? Number(expense.sourceAmount)
      : Number(expense.amount || 0);
    const fallbackCurrency = groupCurrencyById.get(Number(expense.groupId || 0)) || "INR";
    const sourceCurrency = String(expense.sourceCurrency || "").trim().toUpperCase();
    expense.sourceCurrency = /^[A-Z]{3}$/.test(sourceCurrency) ? sourceCurrency : fallbackCurrency;
    const ratio = Number(expense.sourceAmount || 0) > 0
      ? Number(expense.amount || 0) / Number(expense.sourceAmount || 0)
      : 1;
    expense.fxRateToGroup = Number.isFinite(Number(expense.fxRateToGroup)) && Number(expense.fxRateToGroup) > 0
      ? Number(expense.fxRateToGroup)
      : Number.isFinite(ratio) && ratio > 0
        ? ratio
        : 1;
    expense.fxProvider = String(expense.fxProvider || "identity");
    expense.fxFetchedAt = String(expense.fxFetchedAt || expense.createdAt || nowISO());
  }

  for (const job of db.notificationQueue) {
    job.status = String(job.status || "queued").trim().toLowerCase();
    job.channel = String(job.channel || "").trim().toLowerCase();
    job.attempts = Number.isFinite(Number(job.attempts)) ? Number(job.attempts) : 0;
    job.maxAttempts = Number.isFinite(Number(job.maxAttempts)) ? Number(job.maxAttempts) : 4;
    job.groupId = Number(job.groupId || 0);
    job.logId = Number(job.logId || 0);
    job.nextAttemptAt = String(job.nextAttemptAt || nowISO());
    job.createdAt = String(job.createdAt || nowISO());
    job.updatedAt = String(job.updatedAt || job.createdAt);
    job.lastError = String(job.lastError || "");
  }

  for (const rule of db.recurringExpenses) {
    rule.groupId = Number(rule.groupId || 0);
    rule.amount = Number.isFinite(Number(rule.amount)) ? Number(rule.amount) : 0;
    rule.sourceAmount = Number.isFinite(Number(rule.sourceAmount))
      ? Number(rule.sourceAmount)
      : Number(rule.amount || 0);
    const fallbackCurrency = groupCurrencyById.get(Number(rule.groupId || 0)) || "INR";
    const sourceCurrency = String(rule.sourceCurrency || "").trim().toUpperCase();
    rule.sourceCurrency = /^[A-Z]{3}$/.test(sourceCurrency) ? sourceCurrency : fallbackCurrency;
    const ratio = Number(rule.sourceAmount || 0) > 0
      ? Number(rule.amount || 0) / Number(rule.sourceAmount || 0)
      : 1;
    rule.fxRateToGroup = Number.isFinite(Number(rule.fxRateToGroup)) && Number(rule.fxRateToGroup) > 0
      ? Number(rule.fxRateToGroup)
      : Number.isFinite(ratio) && ratio > 0
        ? ratio
        : 1;
    rule.fxProvider = String(rule.fxProvider || "identity");
    rule.fxFetchedAt = String(rule.fxFetchedAt || rule.updatedAt || rule.createdAt || nowISO());
    rule.dayOfMonth = Math.min(28, Math.max(1, Number(rule.dayOfMonth || 1)));
    rule.active = rule.active !== false;
    rule.lastRunMonth = String(rule.lastRunMonth || "");
    rule.createdAt = String(rule.createdAt || nowISO());
    rule.updatedAt = String(rule.updatedAt || rule.createdAt);
  }

  for (const comment of db.expenseComments) {
    comment.groupId = Number(comment.groupId || 0);
    comment.expenseId = Number(comment.expenseId || 0);
    comment.createdByUserId = Number.isFinite(Number(comment.createdByUserId))
      ? Number(comment.createdByUserId)
      : null;
    comment.authorName = String(comment.authorName || "").trim();
    comment.text = String(comment.text || "").trim();
    comment.createdAt = String(comment.createdAt || nowISO());
  }

  for (const activity of db.activityLogs) {
    activity.groupId = Number(activity.groupId || 0);
    activity.type = String(activity.type || "event").trim().toLowerCase();
    activity.message = String(activity.message || "").trim();
    activity.createdByUserId = Number.isFinite(Number(activity.createdByUserId))
      ? Number(activity.createdByUserId)
      : null;
    activity.createdAt = String(activity.createdAt || nowISO());
  }

  for (const subscription of db.webPushSubscriptions) {
    subscription.userId = Number(subscription.userId || 0);
    subscription.endpoint = String(subscription.endpoint || "").trim();
    subscription.keys = subscription.keys && typeof subscription.keys === "object" ? subscription.keys : {};
    subscription.keys.p256dh = String(subscription.keys.p256dh || "").trim();
    subscription.keys.auth = String(subscription.keys.auth || "").trim();
    subscription.createdAt = String(subscription.createdAt || nowISO());
    subscription.updatedAt = String(subscription.updatedAt || subscription.createdAt);
    subscription.lastSuccessAt = String(subscription.lastSuccessAt || "");
    subscription.lastError = String(subscription.lastError || "");
  }

  for (const challenge of db.loginOtpChallenges) {
    challenge.userId = Number(challenge.userId || 0);
    challenge.email = String(challenge.email || "").trim().toLowerCase();
    challenge.challengeHash = String(challenge.challengeHash || "").trim();
    challenge.otpHash = String(challenge.otpHash || "").trim();
    challenge.attempts = Number.isFinite(Number(challenge.attempts)) ? Number(challenge.attempts) : 0;
    challenge.maxAttempts = Number.isFinite(Number(challenge.maxAttempts)) ? Number(challenge.maxAttempts) : 5;
    challenge.expiresAt = String(challenge.expiresAt || nowISO());
    challenge.usedAt = challenge.usedAt ? String(challenge.usedAt) : null;
    challenge.createdAt = String(challenge.createdAt || nowISO());
  }

  for (const method of db.paymentMethods) {
    method.id = Number(method.id || 0);
    method.userId = Number(method.userId || 0);
    const type = String(method.type || "").trim().toLowerCase();
    method.type = type === "upi" || type === "card" ? type : "upi";
    const provider = String(method.provider || "").trim().toLowerCase();
    method.provider = provider || (method.type === "card" ? "stripe" : "razorpay");
    method.name = String(method.name || (method.type === "card" ? "Credit / Debit Card" : "UPI")).trim();
    method.accountMask = String(method.accountMask || "").trim();
    method.upiId = String(method.upiId || "").trim().toLowerCase();
    method.stripePaymentMethodId = String(method.stripePaymentMethodId || "").trim();
    method.cardBrand = String(method.cardBrand || "").trim().toLowerCase();
    method.cardLast4 = String(method.cardLast4 || "").trim();
    method.cardExpMonth = Number.isFinite(Number(method.cardExpMonth))
      ? Number(method.cardExpMonth)
      : null;
    method.cardExpYear = Number.isFinite(Number(method.cardExpYear))
      ? Number(method.cardExpYear)
      : null;
    method.cardFingerprint = String(method.cardFingerprint || "").trim();
    method.verifiedAt = String(method.verifiedAt || method.createdAt || nowISO());
    method.verificationStatus = String(method.verificationStatus || "verified")
      .trim()
      .toLowerCase();
    method.active = method.active !== false;
    method.createdAt = String(method.createdAt || nowISO());
    method.updatedAt = String(method.updatedAt || method.createdAt);
  }

  const metaDefaults = {
    nextGroupId: nextIdFrom(db.groups),
    nextMemberId: nextIdFrom(db.members),
    nextExpenseId: nextIdFrom(db.expenses),
    nextUserId: nextIdFrom(db.users),
    nextNotificationLogId: nextIdFrom(db.notificationLogs),
    nextNotificationJobId: nextIdFrom(db.notificationQueue),
    nextSettlementPaymentId: nextIdFrom(db.settlementPayments),
    nextPaymentMethodId: nextIdFrom(db.paymentMethods),
    nextGroupInviteId: nextIdFrom(db.groupInvites),
    nextPasswordResetTokenId: nextIdFrom(db.passwordResetTokens),
    nextEmailVerificationTokenId: nextIdFrom(db.emailVerificationTokens),
    nextRecurringExpenseId: nextIdFrom(db.recurringExpenses),
    nextExpenseCommentId: nextIdFrom(db.expenseComments),
    nextActivityLogId: nextIdFrom(db.activityLogs),
    nextWebPushSubscriptionId: nextIdFrom(db.webPushSubscriptions),
    nextLoginOtpChallengeId: nextIdFrom(db.loginOtpChallenges),
  };

  for (const [key, fallback] of Object.entries(metaDefaults)) {
    const current = Number(db.meta[key]);
    db.meta[key] = Number.isFinite(current) && current > 0 ? current : fallback;
  }

  return db;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableValueForSignature(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableValueForSignature(item));
  }

  if (value && typeof value === "object") {
    const output = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      output[key] = stableValueForSignature(value[key]);
    }
    return output;
  }

  return value;
}

function stableSignature(value) {
  return JSON.stringify(stableValueForSignature(value));
}

function collectGroupIds(db) {
  const ids = new Set();
  for (const group of db.groups || []) {
    const id = Number(group?.id || 0);
    if (Number.isFinite(id) && id > 0) {
      ids.add(id);
    }
  }

  for (const key of GROUP_SCOPED_COLLECTIONS) {
    const rows = Array.isArray(db[key]) ? db[key] : [];
    for (const row of rows) {
      const id = Number(row?.groupId || 0);
      if (Number.isFinite(id) && id > 0) {
        ids.add(id);
      }
    }
  }

  return Array.from(ids).sort((a, b) => a - b);
}

function createBlankGroupSnapshot() {
  return {
    group: null,
    members: [],
    expenses: [],
    notificationLogs: [],
    settlementPayments: [],
    groupInvites: [],
    recurringExpenses: [],
    expenseComments: [],
    activityLogs: [],
  };
}

function buildGroupSnapshotMap(db) {
  const map = new Map();
  const ensureGroupSnapshot = (groupId) => {
    const id = Number(groupId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    if (!map.has(id)) {
      map.set(id, createBlankGroupSnapshot());
    }
    return map.get(id);
  };

  for (const group of db.groups || []) {
    const snapshot = ensureGroupSnapshot(group?.id);
    if (!snapshot) continue;
    snapshot.group = group || null;
  }

  const attachRows = (collectionName) => {
    for (const row of db[collectionName] || []) {
      const snapshot = ensureGroupSnapshot(row?.groupId);
      if (!snapshot) continue;
      snapshot[collectionName].push(row);
    }
  };

  attachRows("members");
  attachRows("expenses");
  attachRows("notificationLogs");
  attachRows("settlementPayments");
  attachRows("groupInvites");
  attachRows("recurringExpenses");
  attachRows("expenseComments");
  attachRows("activityLogs");

  for (const snapshot of map.values()) {
    for (const key of GROUP_SCOPED_COLLECTIONS) {
      snapshot[key].sort((left, right) => Number(left?.id || 0) - Number(right?.id || 0));
    }
  }

  return map;
}

function detectChangedGroupIds(previousDb, nextDb) {
  const previousMap = buildGroupSnapshotMap(previousDb);
  const nextMap = buildGroupSnapshotMap(nextDb);
  const ids = new Set([...collectGroupIds(previousDb), ...collectGroupIds(nextDb)]);
  const changed = [];

  for (const id of ids) {
    const previousSignature = stableSignature(previousMap.get(id) || null);
    const nextSignature = stableSignature(nextMap.get(id) || null);
    if (previousSignature !== nextSignature) {
      changed.push(id);
    }
  }

  return changed.sort((a, b) => a - b);
}

function createRealtimeMutationEvent(previousDb, nextDb) {
  const changedGroupIds = detectChangedGroupIds(previousDb, nextDb);
  if (changedGroupIds.length === 0 && stableSignature(previousDb) === stableSignature(nextDb)) {
    return null;
  }

  return {
    type: "db.updated",
    occurredAt: nowISO(),
    changedGroupIds,
  };
}

function round2(value) {
  return Number((value + Number.EPSILON).toFixed(2));
}

export async function readDB() {
  return ensureDatabaseShape(await readStateFromDisk());
}

async function writeDB(data) {
  await writeStateToDisk(ensureDatabaseShape(data));
}

export async function updateDB(mutator) {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      const db = ensureDatabaseShape(await readDB());
      const draft = clone(db);
      const next = ensureDatabaseShape((await mutator(draft)) ?? draft);
      await writeDB(next);
      const event = createRealtimeMutationEvent(db, next);
      if (event) {
        publishRealtimeEvent(event);
      }
      return next;
    });

  return writeQueue;
}

export function nowISO() {
  return new Date().toISOString();
}

function getSplitAmounts(expense, participants) {
  const amounts = new Map();
  const partIds = participants.map((id) => Number(id));

  if (partIds.length === 0) {
    return amounts;
  }

  if (expense.splitMode === "percent") {
    const config = expense.splitConfig?.percentages || {};
    for (const memberId of partIds) {
      const pct = Number(config[memberId] || 0);
      amounts.set(memberId, round2((expense.amount * pct) / 100));
    }
    return amounts;
  }

  if (expense.splitMode === "shares") {
    const shares = expense.splitConfig?.shares || {};
    let totalShares = 0;
    for (const memberId of partIds) {
      totalShares += Number(shares[memberId] || 0);
    }

    if (totalShares <= 0) {
      const equalShare = round2(expense.amount / partIds.length);
      for (const memberId of partIds) amounts.set(memberId, equalShare);
      return amounts;
    }

    for (const memberId of partIds) {
      const share = Number(shares[memberId] || 0);
      amounts.set(memberId, round2((expense.amount * share) / totalShares));
    }

    return amounts;
  }

  const equalShare = round2(expense.amount / partIds.length);
  for (const memberId of partIds) amounts.set(memberId, equalShare);
  return amounts;
}

export function buildGroupSummary(group, members, expenses, settlementPayments = []) {
  const memberMap = new Map();

  for (const member of members) {
    memberMap.set(member.id, {
      memberId: member.id,
      name: member.name,
      paid: 0,
      owes: 0,
      net: 0,
    });
  }

  let totalSpent = 0;
  const categoryMap = new Map();

  for (const expense of expenses) {
    totalSpent += Number(expense.amount);
    const payer = memberMap.get(expense.payerMemberId);

    if (payer) {
      payer.paid = round2(payer.paid + Number(expense.amount));
    }

    const splitAmounts = getSplitAmounts(expense, expense.participants || []);

    for (const [memberId, amount] of splitAmounts.entries()) {
      const entry = memberMap.get(memberId);
      if (entry) {
        entry.owes = round2(entry.owes + amount);
      }
    }

    const prev = categoryMap.get(expense.category) || 0;
    categoryMap.set(expense.category, round2(prev + Number(expense.amount)));
  }

  let settledAmount = 0;
  let paymentCount = 0;

  for (const payment of settlementPayments || []) {
    const status = String(payment?.status || "completed").toLowerCase();
    if (status !== "completed") continue;

    const amount = Number(payment?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const fromMemberId = Number(payment?.fromMemberId);
    const toMemberId = Number(payment?.toMemberId);
    if (!Number.isFinite(fromMemberId) || !Number.isFinite(toMemberId) || fromMemberId === toMemberId) continue;

    const payer = memberMap.get(fromMemberId);
    const payee = memberMap.get(toMemberId);
    if (!payer || !payee) continue;

    // Completed settlement payment offsets outstanding net balances.
    payer.paid = round2(payer.paid + amount);
    payee.owes = round2(payee.owes + amount);
    settledAmount = round2(settledAmount + amount);
    paymentCount += 1;
  }

  const balances = Array.from(memberMap.values()).map((entry) => ({
    ...entry,
    net: round2(entry.paid - entry.owes),
  }));

  const simplified = simplifyDebts(balances);
  const settlements = simplified.settlements;

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return {
    groupId: group.id,
    currency: group.currency,
    totalSpent: round2(totalSpent),
    expenseCount: expenses.length,
    settledAmount,
    paymentCount,
    balances,
    settlements,
    settlementStats: simplified.stats,
    categoryBreakdown,
  };
}

export function groupBundle(db, groupId) {
  const id = Number(groupId);
  const group = db.groups.find((item) => item.id === id);

  if (!group) return null;

  const members = db.members.filter((item) => item.groupId === id);
  const expenses = db.expenses
    .filter((item) => item.groupId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const notificationLogs = db.notificationLogs
    .filter((item) => item.groupId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const settlementPayments = db.settlementPayments
    .filter((item) => item.groupId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const invites = db.groupInvites
    .filter((item) => item.groupId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const recurringExpenses = db.recurringExpenses
    .filter((item) => item.groupId === id)
    .sort((a, b) => Number(b.id) - Number(a.id));
  const expenseComments = db.expenseComments
    .filter((item) => item.groupId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const activityLogs = db.activityLogs
    .filter((item) => item.groupId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const summary = buildGroupSummary(group, members, expenses, settlementPayments);

  return {
    ...group,
    members,
    expenses,
    notificationLogs,
    settlementPayments,
    invites,
    recurringExpenses,
    expenseComments,
    activityLogs,
    summary,
  };
}

export function appendActivity(
  draft,
  {
    groupId,
    type = "event",
    message = "",
    createdByUserId = null,
    relatedExpenseId = null,
    relatedPaymentId = null,
    relatedCommentId = null,
  }
) {
  if (!draft || !Number.isFinite(Number(groupId)) || !message) return draft;

  const id = Number(draft.meta.nextActivityLogId);
  draft.meta.nextActivityLogId += 1;
  draft.activityLogs.push({
    id,
    groupId: Number(groupId),
    type: String(type || "event").trim().toLowerCase(),
    message: String(message || "").trim(),
    createdByUserId: Number.isFinite(Number(createdByUserId)) ? Number(createdByUserId) : null,
    relatedExpenseId: Number.isFinite(Number(relatedExpenseId)) ? Number(relatedExpenseId) : null,
    relatedPaymentId: Number.isFinite(Number(relatedPaymentId)) ? Number(relatedPaymentId) : null,
    relatedCommentId: Number.isFinite(Number(relatedCommentId)) ? Number(relatedCommentId) : null,
    createdAt: nowISO(),
  });
  return draft;
}

export function groupsWithStats(db) {
  return db.groups.map((group) => {
    const members = db.members.filter((m) => m.groupId === group.id);
    const expenses = db.expenses.filter((e) => e.groupId === group.id);
    const totalSpent = round2(expenses.reduce((acc, item) => acc + Number(item.amount), 0));

    return {
      ...group,
      memberCount: members.length,
      expenseCount: expenses.length,
      totalSpent,
    };
  });
}

export function buildAnalytics(db) {
  const totalGroups = db.groups.length;
  const totalMembers = db.members.length;
  const totalExpenses = db.expenses.length;
  const totalSpent = round2(db.expenses.reduce((acc, item) => acc + Number(item.amount), 0));

  const payerTotals = new Map();

  for (const expense of db.expenses) {
    const prev = payerTotals.get(expense.payerMemberId) || 0;
    payerTotals.set(expense.payerMemberId, round2(prev + Number(expense.amount)));
  }

  const topPayers = Array.from(payerTotals.entries())
    .map(([memberId, amount]) => {
      const member = db.members.find((item) => item.id === memberId);
      return {
        memberId,
        memberName: member ? member.name : `Member ${memberId}`,
        amount,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const pendingSettlements = db.groups.reduce((count, group) => {
    const members = db.members.filter((m) => m.groupId === group.id);
    const expenses = db.expenses.filter((e) => e.groupId === group.id);
    const settlementPayments = (db.settlementPayments || []).filter((item) => item.groupId === group.id);
    const summary = buildGroupSummary(group, members, expenses, settlementPayments);
    return count + summary.settlements.length;
  }, 0);

  return {
    metrics: {
      totalGroups,
      totalMembers,
      totalExpenses,
      totalSpent,
      pendingSettlements,
    },
    topPayers,
  };
}

export function parseReceiptText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const merchant = lines[0] || "Unknown Merchant";

  let total = null;
  const totalRegex = /(total|grand total|amount)\D*([0-9]+(?:[.,][0-9]{1,2})?)/i;

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const match = lines[i].match(totalRegex);
    if (match) {
      total = Number(match[2].replace(",", "."));
      break;
    }
  }

  if (!total) {
    const allNumbers = String(text).match(/[0-9]+(?:[.,][0-9]{1,2})?/g) || [];
    const parsed = allNumbers.map((n) => Number(n.replace(",", "."))).filter((n) => Number.isFinite(n));
    total = parsed.length ? Math.max(...parsed) : 0;
  }

  const dateMatch = String(text).match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/);
  const receiptDate = dateMatch ? dateMatch[1] : null;

  const items = [];
  const itemRegex = /^(.+?)\s+([0-9]+(?:[.,][0-9]{1,2})?)$/;

  for (const line of lines) {
    if (/total/i.test(line)) continue;
    const match = line.match(itemRegex);
    if (!match) continue;

    const name = match[1].trim();
    const amount = Number(match[2].replace(",", "."));
    if (!name || !Number.isFinite(amount)) continue;
    items.push({ name, amount });
  }

  const lower = merchant.toLowerCase();
  let suggestedCategory = "Misc";

  if (/(mart|super|grocery|store)/.test(lower)) suggestedCategory = "Groceries";
  if (/(cafe|restaurant|food|diner)/.test(lower)) suggestedCategory = "Food";
  if (/(fuel|petrol|taxi|uber|ola|travel)/.test(lower)) suggestedCategory = "Transport";
  if (/(electric|internet|broadband|water|gas)/.test(lower)) suggestedCategory = "Utilities";

  let confidence = 0.35;
  if (merchant) confidence += 0.2;
  if (total > 0) confidence += 0.25;
  if (receiptDate) confidence += 0.1;
  if (items.length > 0) confidence += 0.1;

  confidence = Math.min(0.97, round2(confidence));

  return {
    merchant,
    total: round2(total),
    receiptDate,
    items,
    confidence,
    suggestedTitle: merchant,
    suggestedCategory,
  };
}
