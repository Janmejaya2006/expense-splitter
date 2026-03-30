import { NextResponse } from "next/server";
import { appendActivity, groupBundle, nowISO, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { detectExpenseCategory } from "@/lib/category";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

async function resolveIds(paramsPromise) {
  const params = await parseRouteParams(
    paramsPromise,
    z.object({
      id: z.coerce.number().int().positive("Invalid group/recurring id"),
      recurringId: z.coerce.number().int().positive("Invalid group/recurring id"),
    })
  );
  return {
    groupId: Number(params.id),
    recurringId: Number(params.recurringId),
  };
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

function normalizeDay(value) {
  return Math.min(28, Math.max(1, Number(value || 1)));
}

const recurringPatchSchema = z
  .object({
    title: z.string().trim().min(1, "Recurring expense title is required").max(160, "Title is too long").optional(),
    amount: z.coerce.number().finite().positive("Amount must be positive").optional(),
    payerMemberId: z.coerce.number().int().positive("Valid payer is required").optional(),
    participants: z
      .array(z.coerce.number().int().positive())
      .min(1, "Select at least one participant")
      .transform((ids) => Array.from(new Set(ids)))
      .optional(),
    splitMode: z.enum(["equal", "percent", "shares"]).optional(),
    splitConfig: z.unknown().optional(),
    category: z.string().trim().max(80, "Category is too long").optional(),
    notes: z.string().trim().max(1000, "Notes are too long").optional(),
    dayOfMonth: z.coerce.number().int().min(1).max(28, "Day of month must be between 1 and 28").optional(),
    active: z.boolean().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, "Nothing to update");

export async function PATCH(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, recurringId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(recurringId)) {
      return NextResponse.json({ error: "Invalid group/recurring id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "editExpense")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await parseRequestBody(request, recurringPatchSchema, {
      invalidJsonMessage: "Invalid recurring expense payload",
    });
    const hasTitle = body.title !== undefined;
    const hasAmount = body.amount !== undefined;
    const hasPayer = body.payerMemberId !== undefined;
    const hasParticipants = body.participants !== undefined;
    const hasSplitMode = body.splitMode !== undefined;
    const hasSplitConfig = body.splitConfig !== undefined;
    const hasCategory = body.category !== undefined;
    const hasNotes = body.notes !== undefined;
    const hasDay = body.dayOfMonth !== undefined;
    const hasActive = body.active !== undefined;

    if (
      !hasTitle &&
      !hasAmount &&
      !hasPayer &&
      !hasParticipants &&
      !hasSplitMode &&
      !hasSplitConfig &&
      !hasCategory &&
      !hasNotes &&
      !hasDay &&
      !hasActive
    ) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const db = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "editExpense")) {
        throw new Error("FORBIDDEN");
      }

      const recurring = (draft.recurringExpenses || []).find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === recurringId
      );
      if (!recurring) {
        throw new Error("NOT_FOUND");
      }

      const validMembers = (draft.members || []).filter((item) => Number(item.groupId) === groupId).map((item) => item.id);
      const group = draft.groups.find((item) => Number(item.id) === Number(groupId));
      const groupCurrency = String(group?.currency || "INR").trim().toUpperCase();
      const nextSplitMode = hasSplitMode ? String(body.splitMode || "equal") : String(recurring.splitMode || "equal");
      if (!["equal", "percent", "shares"].includes(nextSplitMode)) {
        throw new Error("INVALID_SPLIT_MODE");
      }

      if (hasTitle) recurring.title = String(body.title || "").trim();
      if (hasAmount) recurring.amount = Number(body.amount || 0);
      if (hasPayer) recurring.payerMemberId = Number(body.payerMemberId);
      if (hasParticipants) {
        recurring.participants = (body.participants || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id));
      }
      if (hasSplitMode) recurring.splitMode = nextSplitMode;
      if (hasSplitMode || hasSplitConfig) {
        recurring.splitConfig = parseSplitConfig(nextSplitMode, body.splitConfig ?? recurring.splitConfig ?? null);
      }
      if (hasCategory) {
        const requestedCategory = String(body.category || "").trim();
        recurring.category =
          !requestedCategory || requestedCategory.toLowerCase() === "auto"
            ? detectExpenseCategory({
                title: hasTitle ? String(body.title || "").trim() : recurring.title,
                notes: hasNotes ? String(body.notes || "").trim() : recurring.notes,
                fallback: "Misc",
              })
            : requestedCategory;
      }
      if (hasNotes) recurring.notes = String(body.notes || "").trim();
      if (hasDay) recurring.dayOfMonth = normalizeDay(body.dayOfMonth);
      if (hasActive) recurring.active = Boolean(body.active);
      if (hasAmount) {
        recurring.sourceAmount = Number(recurring.amount || 0);
        recurring.sourceCurrency = /^[A-Z]{3}$/.test(groupCurrency) ? groupCurrency : "INR";
        recurring.fxRateToGroup = 1;
        recurring.fxProvider = "manual-edit";
        recurring.fxFetchedAt = nowISO();
      }
      recurring.updatedAt = nowISO();

      if (!recurring.title) throw new Error("INVALID_TITLE");
      if (!Number.isFinite(Number(recurring.amount)) || Number(recurring.amount) <= 0) throw new Error("INVALID_AMOUNT");
      if (!validMembers.includes(Number(recurring.payerMemberId))) throw new Error("INVALID_PAYER");
      if (!Array.isArray(recurring.participants) || recurring.participants.length === 0) throw new Error("INVALID_PARTICIPANTS");

      for (const memberId of recurring.participants) {
        if (!validMembers.includes(Number(memberId))) {
          throw new Error("INVALID_PARTICIPANTS");
        }
      }

      appendActivity(draft, {
        groupId,
        type: "recurring_updated",
        message: `Recurring expense "${recurring.title}" was updated.`,
        createdByUserId: Number(session.userId || 0) || null,
      });

      return draft;
    });

    const group = groupBundle(db, groupId);
    return NextResponse.json({ recurringExpenses: group?.recurringExpenses || [] });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Recurring expense not found" }, { status: 404 });
    }
    if (error.message === "INVALID_PERCENT_TOTAL") {
      return NextResponse.json({ error: "Percent split must total 100" }, { status: 400 });
    }
    if (error.message === "INVALID_SHARES") {
      return NextResponse.json({ error: "Shares split must have positive total shares" }, { status: 400 });
    }
    if (error.message === "INVALID_SPLIT_MODE") {
      return NextResponse.json({ error: "Invalid split mode" }, { status: 400 });
    }
    if (error.message === "INVALID_TITLE") {
      return NextResponse.json({ error: "Recurring expense title is required" }, { status: 400 });
    }
    if (error.message === "INVALID_AMOUNT") {
      return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
    }
    if (error.message === "INVALID_PAYER") {
      return NextResponse.json({ error: "Payer must be a member of this group" }, { status: 400 });
    }
    if (error.message === "INVALID_PARTICIPANTS") {
      return NextResponse.json({ error: "Participants must belong to this group" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update recurring expense" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, recurringId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(recurringId)) {
      return NextResponse.json({ error: "Invalid group/recurring id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "editExpense")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const db = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "editExpense")) {
        throw new Error("FORBIDDEN");
      }

      const recurring = (draft.recurringExpenses || []).find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === recurringId
      );
      if (!recurring) {
        throw new Error("NOT_FOUND");
      }

      draft.recurringExpenses = (draft.recurringExpenses || []).filter(
        (item) => !(Number(item.groupId) === groupId && Number(item.id) === recurringId)
      );

      appendActivity(draft, {
        groupId,
        type: "recurring_deleted",
        message: `Recurring expense "${recurring.title}" was deleted.`,
        createdByUserId: Number(session.userId || 0) || null,
      });
      return draft;
    });

    const group = groupBundle(db, groupId);
    return NextResponse.json({ recurringExpenses: group?.recurringExpenses || [] });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Recurring expense not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete recurring expense" }, { status: 500 });
  }
}
