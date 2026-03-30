import { NextResponse } from "next/server";
import { appendActivity, groupBundle, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { deleteStoredProof } from "@/lib/proofStorage";
import { detectExpenseCategory } from "@/lib/category";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

async function resolveIds(paramsPromise) {
  const params = await parseRouteParams(
    paramsPromise,
    z.object({
      id: z.coerce.number().int().positive("Invalid group/expense id"),
      expenseId: z.coerce.number().int().positive("Invalid group/expense id"),
    })
  );
  return {
    groupId: Number(params.id),
    expenseId: Number(params.expenseId),
  };
}

const expensePatchSchema = z.object({
  title: z.string().trim().min(1, "Expense title is required").max(160, "Expense title is too long"),
  amount: z.coerce.number().finite().positive("Amount must be positive"),
  payerMemberId: z.coerce.number().int().positive("Valid payer is required"),
  participants: z
    .array(z.coerce.number().int().positive())
    .min(1, "Select at least one participant")
    .transform((ids) => Array.from(new Set(ids))),
  splitMode: z.enum(["equal", "percent", "shares"]).default("equal"),
  splitConfig: z.unknown().optional().nullable(),
  category: z.string().trim().max(80, "Category is too long").optional().default(""),
  expenseDate: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => !value || Number.isFinite(new Date(value).getTime()), "Expense date is invalid"),
  notes: z.string().trim().max(1000, "Notes are too long").optional().default(""),
});

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

export async function PATCH(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, expenseId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(expenseId)) {
      return NextResponse.json({ error: "Invalid group/expense id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "editExpense")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await parseRequestBody(request, expensePatchSchema, {
      invalidJsonMessage: "Invalid expense payload",
    });

    const title = body.title;
    const amount = Number(body.amount || 0);
    const payerMemberId = Number(body.payerMemberId);
    const participants = body.participants;
    const splitMode = body.splitMode;
    const splitConfig = parseSplitConfig(splitMode, body.splitConfig || null);
    const requestedCategory = String(body.category || "").trim();
    const expenseDate = String(body.expenseDate || "").trim();
    const notes = String(body.notes || "").trim();
    const category =
      !requestedCategory || requestedCategory.toLowerCase() === "auto"
        ? detectExpenseCategory({ title, notes, fallback: "Misc" })
        : requestedCategory;

    let removedProofPath = "";
    const db = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "editExpense")) {
        throw new Error("FORBIDDEN");
      }

      const expense = draft.expenses.find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === expenseId
      );
      if (!expense) {
        throw new Error("NOT_FOUND");
      }

      const validMembers = draft.members.filter((item) => item.groupId === groupId).map((item) => item.id);
      const group = draft.groups.find((item) => Number(item.id) === Number(groupId));
      const groupCurrency = String(group?.currency || "INR").trim().toUpperCase();

      if (!validMembers.includes(payerMemberId)) {
        throw new Error("INVALID_PAYER");
      }

      for (const memberId of participants) {
        if (!validMembers.includes(memberId)) {
          throw new Error("INVALID_PARTICIPANT");
        }
      }

      expense.title = title;
      expense.amount = amount;
      expense.sourceAmount = amount;
      expense.sourceCurrency = /^[A-Z]{3}$/.test(groupCurrency) ? groupCurrency : "INR";
      expense.fxRateToGroup = 1;
      expense.fxProvider = "manual-edit";
      expense.fxFetchedAt = new Date().toISOString();
      expense.payerMemberId = payerMemberId;
      expense.participants = participants;
      expense.splitMode = splitMode;
      expense.splitConfig = splitConfig;
      expense.category = category;
      expense.expenseDate = expenseDate || expense.expenseDate;
      expense.notes = notes;

      appendActivity(draft, {
        groupId,
        type: "expense_updated",
        message: `Expense "${title}" was updated.`,
        createdByUserId: Number(session.userId || 0) || null,
        relatedExpenseId: expenseId,
      });

      return draft;
    });

    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
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

    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Failed to update expense" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, expenseId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(expenseId)) {
      return NextResponse.json({ error: "Invalid group/expense id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "editExpense")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const db = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "editExpense")) {
        throw new Error("FORBIDDEN");
      }

      const exists = draft.expenses.some(
        (item) => Number(item.groupId) === groupId && Number(item.id) === expenseId
      );
      if (!exists) {
        throw new Error("NOT_FOUND");
      }

      const deleting = draft.expenses.find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === expenseId
      );
      removedProofPath = String(deleting?.proofPath || "").trim();
      draft.expenses = draft.expenses.filter(
        (item) => !(Number(item.groupId) === groupId && Number(item.id) === expenseId)
      );
      draft.expenseComments = (draft.expenseComments || []).filter(
        (item) => !(Number(item.groupId) === groupId && Number(item.expenseId) === expenseId)
      );

      appendActivity(draft, {
        groupId,
        type: "expense_deleted",
        message: deleting?.title ? `Expense "${deleting.title}" was deleted.` : "An expense was deleted.",
        createdByUserId: Number(session.userId || 0) || null,
        relatedExpenseId: expenseId,
      });
      return draft;
    });

    if (removedProofPath) {
      await deleteStoredProof(removedProofPath);
    }

    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete expense" }, { status: 500 });
  }
}
