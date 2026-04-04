import { NextResponse } from "next/server";
import { appendActivity, groupBundle, nowISO, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup, hasGroupPermission } from "@/lib/access";
import { storeExpenseProof } from "@/lib/proofStorage";
import { detectExpenseCategory } from "@/lib/category";
import { hasWebPushConfig, sendWebPushBatch } from "@/lib/webPush";
import { convertAmountToCurrency, normalizeCurrencyCode } from "@/lib/fx";
import { findPotentialDuplicateExpense } from "@/lib/expenseDuplicates";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { parseRequestBody, parseRouteParams, parseWithSchema, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const groupParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group id"),
});

const splitModeSchema = z.enum(["equal", "percent", "shares"]);

const expenseCreateSchema = z.object({
  title: z.string().trim().min(1, "Expense title is required").max(160, "Expense title is too long"),
  amount: z.coerce.number().finite().positive("Amount must be positive"),
  payerMemberId: z.coerce.number().int().positive("Valid payer is required"),
  participants: z
    .array(z.coerce.number().int().positive())
    .min(1, "Select at least one participant")
    .transform((ids) => Array.from(new Set(ids))),
  splitMode: splitModeSchema.default("equal"),
  splitConfig: z.unknown().optional().nullable(),
  category: z.string().trim().max(80, "Category is too long").optional().default(""),
  expenseDate: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => !value || Number.isFinite(new Date(value).getTime()), "Expense date is invalid"),
  notes: z.string().trim().max(1000, "Notes are too long").optional().default(""),
  recurring: z
    .object({
      enabled: z.boolean().optional().default(false),
      dayOfMonth: z.coerce.number().int().min(1).max(28).optional().default(1),
    })
    .optional()
    .nullable(),
  allowDuplicate: z.boolean().optional().default(false),
  proof: z
    .object({
      name: z.string().trim().max(180, "Proof file name is too long").optional().default(""),
      type: z.string().trim().max(120, "Proof file type is too long").optional().default(""),
      base64: z.string().trim().optional().default(""),
    })
    .optional()
    .nullable(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .default("")
    .refine((value) => !value || /^[A-Z]{3}$/.test(value), "Currency must be a valid 3-letter code"),
});

const expenseListQuerySchema = z.object({
  search: z.string().trim().max(200, "Search query is too long").optional().default(""),
  memberId: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().int().positive("memberId must be a positive integer").optional()
  ),
  category: z.string().trim().max(80, "Category filter is too long").optional().default(""),
  dateFrom: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => !value || Number.isFinite(new Date(value).getTime()), "dateFrom is invalid"),
  dateTo: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => !value || Number.isFinite(new Date(value).getTime()), "dateTo is invalid"),
  sortBy: z.enum(["expenseDate", "amount", "title", "category"]).optional().default("expenseDate"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1, "page must be >= 1").max(100000, "page is too large").optional().default(1),
  pageSize: z.coerce.number().int().min(1, "pageSize must be >= 1").max(100, "pageSize must be <= 100").optional().default(20),
});

async function resolveGroupId(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, groupParamsSchema);
  return Number(params.id);
}

function rateLimitResponse(retryAfterMs, errorMessage = "Too many requests. Please try again later.") {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: errorMessage },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

function parseSplitConfig(splitMode, payload) {
  if (splitMode === "percent") {
    const percentages = payload?.percentages || {};
    const values = Object.values(percentages).map((item) => Number(item));
    const total = values.reduce((acc, item) => acc + item, 0);

    if (Math.abs(total - 100) > 0.5) {
      throw new Error("INVALID_PERCENT_TOTAL");
    }

    return { percentages };
  }

  if (splitMode === "shares") {
    const shares = payload?.shares || {};
    const values = Object.values(shares).map((item) => Number(item));
    const total = values.reduce((acc, item) => acc + item, 0);

    if (total <= 0) {
      throw new Error("INVALID_SHARES");
    }

    return { shares };
  }

  return null;
}

function parseRecurringPayload(payload) {
  const enabled = Boolean(payload?.enabled);
  if (!enabled) return { enabled: false, dayOfMonth: 1 };

  const dayOfMonth = Math.min(28, Math.max(1, Number(payload?.dayOfMonth || 1)));
  return {
    enabled: true,
    dayOfMonth,
  };
}

export async function GET(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const groupId = await resolveGroupId(params);

    const db = await readDB();
    if (!canAccessGroup(db, groupId, session)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = groupBundle(db, groupId);

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const query = parseWithSchema(
      expenseListQuerySchema,
      {
        search: searchParams.get("search") ?? undefined,
        memberId: searchParams.get("memberId") ?? undefined,
        category: searchParams.get("category") ?? undefined,
        dateFrom: searchParams.get("dateFrom") ?? undefined,
        dateTo: searchParams.get("dateTo") ?? undefined,
        sortBy: searchParams.get("sortBy") ?? undefined,
        sortDir: searchParams.get("sortDir") ?? undefined,
        page: searchParams.get("page") ?? undefined,
        pageSize: searchParams.get("pageSize") ?? undefined,
      },
      { message: "Invalid expense list query parameters" }
    );
    const search = query.search.toLowerCase();
    const memberId = Number(query.memberId || 0);
    const category = query.category.toLowerCase();
    const dateFrom = query.dateFrom;
    const dateTo = query.dateTo;
    const sortBy = query.sortBy;
    const sortDir = query.sortDir;
    const page = Number(query.page || 1);
    const pageSize = Number(query.pageSize || 20);

    const parseDateValue = (value) => {
      const time = new Date(value || "").getTime();
      return Number.isFinite(time) ? time : null;
    };

    let filtered = [...(group.expenses || [])];

    if (search) {
      filtered = filtered.filter(
        (item) =>
          String(item.title || "").toLowerCase().includes(search) ||
          String(item.notes || "").toLowerCase().includes(search)
      );
    }

    if (Number.isFinite(memberId) && memberId > 0) {
      filtered = filtered.filter(
        (item) => Number(item.payerMemberId) === memberId || (item.participants || []).includes(memberId)
      );
    }

    if (category) {
      filtered = filtered.filter((item) => String(item.category || "").toLowerCase() === category);
    }

    const fromTime = parseDateValue(dateFrom);
    if (fromTime !== null) {
      filtered = filtered.filter((item) => {
        const t = parseDateValue(item.expenseDate || item.createdAt);
        return t !== null && t >= fromTime;
      });
    }

    const toTime = parseDateValue(dateTo);
    if (toTime !== null) {
      filtered = filtered.filter((item) => {
        const t = parseDateValue(item.expenseDate || item.createdAt);
        return t !== null && t <= toTime;
      });
    }

    filtered.sort((a, b) => {
      let left;
      let right;
      if (sortBy === "amount") {
        left = Number(a.amount || 0);
        right = Number(b.amount || 0);
      } else if (sortBy === "title") {
        left = String(a.title || "").toLowerCase();
        right = String(b.title || "").toLowerCase();
      } else if (sortBy === "category") {
        left = String(a.category || "").toLowerCase();
        right = String(b.category || "").toLowerCase();
      } else {
        left = parseDateValue(a.expenseDate || a.createdAt) || 0;
        right = parseDateValue(b.expenseDate || b.createdAt) || 0;
      }

      if (left < right) return sortDir === "asc" ? -1 : 1;
      if (left > right) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const expenses = filtered.slice(start, start + pageSize).map((expense) => ({
      ...expense,
      proofUrl: expense.proofPath ? `/api/groups/${groupId}/expenses/${expense.id}/proof` : null,
    }));

    return NextResponse.json({
      expenses,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load expenses" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const groupId = await resolveGroupId(params);
    const userId = Number(session.userId || 0);
    const ip = getClientIp(request);

    const userLimit = consumeRateLimit({
      key: `groups:${groupId}:expenses:create:user:${userId}`,
      limit: 45,
      windowMs: 5 * 60 * 1000,
      blockDurationMs: 2 * 60 * 1000,
    });
    if (!userLimit.allowed) {
      return rateLimitResponse(
        userLimit.retryAfterMs,
        "Too many expense creation attempts. Please wait and try again."
      );
    }

    const hasClientIp = ip && ip !== "0.0.0.0";
    if (hasClientIp) {
      const ipLimit = consumeRateLimit({
        key: `groups:${groupId}:expenses:create:ip:${ip}`,
        limit: 120,
        windowMs: 5 * 60 * 1000,
        blockDurationMs: 2 * 60 * 1000,
      });
      if (!ipLimit.allowed) {
        return rateLimitResponse(
          ipLimit.retryAfterMs,
          "Too many expense creation attempts from this network. Please wait and try again."
        );
      }
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "addExpense")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await parseRequestBody(request, expenseCreateSchema, {
      invalidJsonMessage: "Invalid expense payload",
    });

    const title = body.title;
    const enteredAmount = Number(body.amount || 0);
    const payerMemberId = Number(body.payerMemberId);
    const participants = body.participants;
    const splitMode = body.splitMode;
    const splitConfig = parseSplitConfig(splitMode, body.splitConfig || null);
    const requestedCategory = body.category;
    const expenseDate = body.expenseDate;
    const notes = body.notes;
    const allowDuplicate = Boolean(body.allowDuplicate);
    const category =
      !requestedCategory || requestedCategory.toLowerCase() === "auto"
        ? detectExpenseCategory({ title, notes, fallback: "Misc" })
        : requestedCategory;
    const recurring = parseRecurringPayload(body.recurring || null);
    const proof = body.proof && typeof body.proof === "object" ? body.proof : null;
    const proofName = String(proof?.name || "");
    const proofMimeType = String(proof?.type || "");
    const proofBase64 = String(proof?.base64 || "");
    const rawCurrency = body.currency;
    const requestedCurrency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : "";

    if (proofBase64 && Buffer.byteLength(proofBase64, "base64") > 1_500_000) {
      return NextResponse.json({ error: "Proof file is too large" }, { status: 400 });
    }

    const existingGroup = groupBundle(existingDb, groupId);
    if (!existingGroup) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const groupCurrency = normalizeCurrencyCode(existingGroup.currency || "INR");
    const validMembers = (existingGroup.members || []).map((member) => Number(member.id));

    if (!validMembers.includes(payerMemberId)) {
      return NextResponse.json({ error: "Payer must be a member of this group" }, { status: 400 });
    }
    for (const memberId of participants) {
      if (!validMembers.includes(memberId)) {
        return NextResponse.json({ error: "Participants must belong to this group" }, { status: 400 });
      }
    }

    let conversion;
    try {
      conversion = await convertAmountToCurrency(
        enteredAmount,
        requestedCurrency || groupCurrency,
        groupCurrency
      );
    } catch {
      return NextResponse.json(
        { error: `Could not convert ${requestedCurrency || groupCurrency} amount to ${groupCurrency}` },
        { status: 400 }
      );
    }

    const amount = Number(conversion.convertedAmount || 0);
    const duplicateCandidate = {
      title,
      amount,
      payerMemberId,
      participants,
      expenseDate: expenseDate || nowISO().slice(0, 10),
    };

    const earlyDuplicate = findPotentialDuplicateExpense(existingGroup.expenses || [], duplicateCandidate);
    if (earlyDuplicate && !allowDuplicate) {
      return NextResponse.json(
        {
          error: "Possible duplicate expense detected. Confirm and retry to continue.",
          code: "DUPLICATE_EXPENSE",
          duplicate: earlyDuplicate,
        },
        { status: 409 }
      );
    }

    let storedProof = null;
    if (proofBase64) {
      storedProof = await storeExpenseProof({
        groupId,
        fileName: proofName,
        mimeType: proofMimeType,
        base64: proofBase64,
      });
    }

    const db = await updateDB((draft) => {
      const group = draft.groups.find((item) => item.id === groupId);
      if (!group) return draft;

      if (!hasGroupPermission(draft, groupId, session, "addExpense")) {
        throw new Error("FORBIDDEN");
      }

      const validMembers = draft.members.filter((item) => item.groupId === groupId).map((item) => item.id);

      if (!validMembers.includes(payerMemberId)) {
        throw new Error("INVALID_PAYER");
      }

      for (const memberId of participants) {
        if (!validMembers.includes(memberId)) {
          throw new Error("INVALID_PARTICIPANT");
        }
      }

      if (!allowDuplicate) {
        const liveDuplicate = findPotentialDuplicateExpense(
          (draft.expenses || []).filter((item) => Number(item.groupId) === groupId),
          duplicateCandidate
        );
        if (liveDuplicate) {
          const duplicateError = new Error("DUPLICATE_EXPENSE");
          duplicateError.duplicate = liveDuplicate;
          throw duplicateError;
        }
      }

      const id = draft.meta.nextExpenseId;
      draft.meta.nextExpenseId += 1;

      const createdAt = nowISO();
      draft.expenses.push({
        id,
        groupId,
        title,
        amount,
        sourceAmount: Number(conversion.sourceAmount || amount),
        sourceCurrency: String(conversion.sourceCurrency || groupCurrency),
        fxRateToGroup: Number(conversion.rate || 1),
        fxProvider: String(conversion.provider || "identity"),
        fxFetchedAt: String(conversion.fetchedAt || createdAt),
        payerMemberId,
        participants,
        splitMode,
        splitConfig,
        category,
        expenseDate: expenseDate || createdAt.slice(0, 10),
        notes,
        proofName: storedProof?.proofName || proofName,
        proofMimeType: storedProof?.proofMimeType || proofMimeType,
        proofPath: storedProof?.proofPath || "",
        proofBytes: Number(storedProof?.proofBytes || 0),
        proofHash: storedProof?.proofHash || "",
        proofStorage: storedProof?.storage || null,
        recurringRuleId: null,
        createdAt,
      });

      if (recurring.enabled) {
        const recurringId = Number(draft.meta.nextRecurringExpenseId);
        draft.meta.nextRecurringExpenseId += 1;
        draft.recurringExpenses.push({
          id: recurringId,
          groupId,
          title,
          amount,
          sourceAmount: Number(conversion.sourceAmount || amount),
          sourceCurrency: String(conversion.sourceCurrency || groupCurrency),
          fxRateToGroup: Number(conversion.rate || 1),
          fxProvider: String(conversion.provider || "identity"),
          fxFetchedAt: String(conversion.fetchedAt || createdAt),
          payerMemberId,
          participants,
          splitMode,
          splitConfig,
          category,
          notes,
          dayOfMonth: recurring.dayOfMonth,
          active: true,
          lastRunMonth: "",
          createdByUserId: Number(session.userId || 0) || null,
          createdAt,
          updatedAt: createdAt,
        });

        const addedExpense = draft.expenses.find((item) => Number(item.id) === Number(id));
        if (addedExpense) {
          addedExpense.recurringRuleId = recurringId;
        }
      }

      appendActivity(draft, {
        groupId,
        type: recurring.enabled ? "expense_recurring_created" : "expense_added",
        message: recurring.enabled
          ? `${title} added as an expense and scheduled monthly recurrence.`
          : `${title} added as an expense.`,
        createdByUserId: Number(session.userId || 0) || null,
        relatedExpenseId: id,
      });

      return draft;
    });

    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    try {
      if (hasWebPushConfig()) {
        const actorUserId = Number(session.userId || 0);
        const payerName =
          group.members?.find((member) => Number(member.id) === Number(payerMemberId))?.name || "A member";
        const recipientUserIds = new Set();
        for (const member of group.members || []) {
          const userId = Number(member.userId || 0);
          if (!Number.isFinite(userId) || userId <= 0 || userId === actorUserId) continue;
          const user = (db.users || []).find((item) => Number(item.id) === userId);
          if (user && user.notificationPreferences?.productUpdates === false) continue;
          recipientUserIds.add(userId);
        }

        const subscriptions = (db.webPushSubscriptions || []).filter((item) =>
          recipientUserIds.has(Number(item.userId || 0))
        );
        const pushResult = await sendWebPushBatch(subscriptions, {
          title: `${group.name}: New expense added`,
          body: `${payerName} added "${title}" for ${group.currency} ${Number(amount).toFixed(2)}.`,
          tag: `group-${group.id}-expense`,
          url: "/",
        });

        if (pushResult.expiredEndpoints?.length) {
          await updateDB((draft) => {
            draft.webPushSubscriptions = (draft.webPushSubscriptions || []).filter(
              (item) => !pushResult.expiredEndpoints.includes(String(item.endpoint || ""))
            );
            return draft;
          });
        }
      }
    } catch {
      // Ignore push errors to avoid blocking expense creation.
    }

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "UNSUPPORTED_PROOF_TYPE") {
      return NextResponse.json(
        { error: "Proof must be PNG, JPEG, WEBP, or PDF." },
        { status: 400 }
      );
    }
    if (error.message === "INVALID_PROOF_CONTENT") {
      return NextResponse.json(
        { error: "Proof content does not match the provided file type." },
        { status: 400 }
      );
    }
    if (error.message === "INVALID_PERCENT_TOTAL") {
      return NextResponse.json({ error: "Percent split must total 100" }, { status: 400 });
    }

    if (error.message === "INVALID_SHARES") {
      return NextResponse.json({ error: "Shares split must have positive total shares" }, { status: 400 });
    }

    if (error.message === "INVALID_PAYER") {
      return NextResponse.json({ error: "Payer must be a member of this group" }, { status: 400 });
    }

    if (error.message === "INVALID_PARTICIPANT") {
      return NextResponse.json({ error: "Participants must belong to this group" }, { status: 400 });
    }

    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "DUPLICATE_EXPENSE") {
      return NextResponse.json(
        {
          error: "Possible duplicate expense detected. Confirm and retry to continue.",
          code: "DUPLICATE_EXPENSE",
          duplicate: error?.duplicate || null,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Failed to add expense" }, { status: 500 });
  }
}
