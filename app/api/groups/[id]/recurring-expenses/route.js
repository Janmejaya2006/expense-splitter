import { NextResponse } from "next/server";
import { appendActivity, groupBundle, nowISO, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup, hasGroupPermission } from "@/lib/access";
import { detectExpenseCategory } from "@/lib/category";
import { convertAmountToCurrency, normalizeCurrencyCode } from "@/lib/fx";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

async function resolveGroupId(paramsPromise) {
  const params = await parseRouteParams(
    paramsPromise,
    z.object({
      id: z.coerce.number().int().positive("Invalid group id"),
    })
  );
  return Number(params.id);
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

function validDay(day) {
  const value = Number(day);
  return Number.isFinite(value) && value >= 1 && value <= 28;
}

const recurringCreateSchema = z.object({
  title: z.string().trim().min(1, "Recurring expense title is required").max(160, "Title is too long"),
  amount: z.coerce.number().finite().positive("Amount must be positive"),
  payerMemberId: z.coerce.number().int().positive("Valid payer is required"),
  participants: z
    .array(z.coerce.number().int().positive())
    .min(1, "Select at least one participant")
    .transform((ids) => Array.from(new Set(ids))),
  splitMode: z.enum(["equal", "percent", "shares"]).default("equal"),
  splitConfig: z.unknown().optional().nullable(),
  category: z.string().trim().max(80, "Category is too long").optional().default(""),
  notes: z.string().trim().max(1000, "Notes are too long").optional().default(""),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .default("")
    .refine((value) => !value || /^[A-Z]{3}$/.test(value), "Currency must be a valid 3-letter code"),
  dayOfMonth: z.coerce.number().int().min(1).max(28, "Day of month must be between 1 and 28").default(1),
  active: z.boolean().optional().default(true),
});

export async function GET(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const groupId = await resolveGroupId(params);
    if (!Number.isFinite(groupId)) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
    }

    const db = await readDB();
    if (!canAccessGroup(db, groupId, session)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ recurringExpenses: group.recurringExpenses || [] });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load recurring expenses" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const groupId = await resolveGroupId(params);
    if (!Number.isFinite(groupId)) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "addExpense")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await parseRequestBody(request, recurringCreateSchema, {
      invalidJsonMessage: "Invalid recurring expense payload",
    });
    const title = body.title;
    const enteredAmount = Number(body.amount || 0);
    const payerMemberId = Number(body.payerMemberId);
    const participants = body.participants;
    const splitMode = String(body.splitMode || "equal");
    const splitConfig = parseSplitConfig(splitMode, body.splitConfig || null);
    const requestedCategory = body.category;
    const notes = body.notes;
    const category =
      !requestedCategory || requestedCategory.toLowerCase() === "auto"
        ? detectExpenseCategory({ title, notes, fallback: "Misc" })
        : requestedCategory;
    const rawCurrency = body.currency;
    const requestedCurrency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : "";
    const dayOfMonth = Number(body.dayOfMonth || 1);
    const active = body.active !== false;

    const group = groupBundle(existingDb, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const groupCurrency = normalizeCurrencyCode(group.currency || "INR");
    const validMembers = (group.members || []).map((member) => Number(member.id));
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

    const db = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "addExpense")) {
        throw new Error("FORBIDDEN");
      }

      const id = Number(draft.meta.nextRecurringExpenseId);
      draft.meta.nextRecurringExpenseId += 1;
      const createdAt = nowISO();

      draft.recurringExpenses.push({
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
        notes,
        dayOfMonth,
        active,
        lastRunMonth: "",
        createdByUserId: Number(session.userId || 0) || null,
        createdAt,
        updatedAt: createdAt,
      });

      appendActivity(draft, {
        groupId,
        type: "recurring_created",
        message: `Recurring expense "${title}" scheduled for day ${dayOfMonth} each month.`,
        createdByUserId: Number(session.userId || 0) || null,
      });

      return draft;
    });

    const updatedGroup = groupBundle(db, groupId);
    return NextResponse.json({ recurringExpenses: updatedGroup?.recurringExpenses || [] }, { status: 201 });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "INVALID_PERCENT_TOTAL") {
      return NextResponse.json({ error: "Percent split must total 100" }, { status: 400 });
    }
    if (error.message === "INVALID_SHARES") {
      return NextResponse.json({ error: "Shares split must have positive total shares" }, { status: 400 });
    }
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to create recurring expense" }, { status: 500 });
  }
}
