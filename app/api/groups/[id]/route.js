import { NextResponse } from "next/server";
import { groupBundle, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup, groupPermissionsForUser, hasGroupPermission } from "@/lib/access";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const groupParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group id"),
});

const groupPatchSchema = z
  .object({
    name: z.string().trim().min(1, "Group name cannot be empty").max(120, "Group name is too long").optional(),
    description: z.string().optional(),
    currency: z
      .string()
      .transform((value) => String(value || "").trim().toUpperCase())
      .refine((value) => /^[A-Z]{3}$/.test(value), "Currency must be a valid 3-letter code")
      .optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, "Nothing to update");

async function resolveGroupId(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, groupParamsSchema);
  return Number(params.id);
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

    const permissions = groupPermissionsForUser(db, groupId, session);
    const canViewInvites = Boolean(permissions?.inviteMembers);
    const safeExpenses = (group.expenses || []).map((expense) => ({
      ...expense,
      proofUrl: expense.proofPath ? `/api/groups/${groupId}/expenses/${expense.id}/proof` : null,
    }));
    const safeSettlementPayments = (group.settlementPayments || []).map((payment) => {
      const safe = {
        ...payment,
      };
      if (safe.proofBase64) {
        delete safe.proofBase64;
      }
      safe.proofUrl = safe.proofPath
        ? `/api/groups/${groupId}/settlements/payments/${safe.id}/proof`
        : null;
      return safe;
    });
    const safeGroup = {
      ...group,
      expenses: safeExpenses,
      settlementPayments: safeSettlementPayments,
      invites: canViewInvites
        ? (group.invites || []).map((invite) => ({
            id: invite.id,
            groupId: invite.groupId,
            email: invite.email,
            role: invite.role || "member",
            status: invite.status || "pending",
            createdByUserId: invite.createdByUserId || null,
            createdAt: invite.createdAt,
            expiresAt: invite.expiresAt,
            acceptedAt: invite.acceptedAt || null,
            acceptedByUserId: invite.acceptedByUserId || null,
            emailDelivery: invite.emailDelivery || null,
          }))
        : [],
    };
    return NextResponse.json({ group: safeGroup, permissions });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load group" }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const id = await resolveGroupId(params);

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, id, session, "manageGroup")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await parseRequestBody(request, groupPatchSchema, {
      invalidJsonMessage: "Invalid group payload",
    });

    const db = await updateDB((draft) => {
      const group = draft.groups.find((item) => item.id === id);
      if (!group) return draft;

      if (body.name !== undefined) {
        group.name = body.name;
      }

      if (body.description !== undefined) {
        group.description = String(body.description).trim();
      }

      if (body.currency !== undefined) {
        group.currency = body.currency;
      }

      return draft;
    });

    const group = groupBundle(db, id);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;

    return NextResponse.json({ error: "Failed to update group" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const id = await resolveGroupId(params);

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, id, session, "deleteGroup")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    let deleted = false;

    await updateDB((draft) => {
      const groupIndex = draft.groups.findIndex((item) => item.id === id);
      if (groupIndex === -1) return draft;

      deleted = true;
      draft.groups.splice(groupIndex, 1);
      draft.members = draft.members.filter((item) => item.groupId !== id);
      draft.expenses = draft.expenses.filter((item) => item.groupId !== id);
      draft.notificationLogs = draft.notificationLogs.filter((item) => item.groupId !== id);
      draft.notificationQueue = draft.notificationQueue.filter((item) => item.groupId !== id);
      draft.settlementPayments = draft.settlementPayments.filter((item) => item.groupId !== id);
      draft.recurringExpenses = (draft.recurringExpenses || []).filter((item) => item.groupId !== id);
      draft.expenseComments = (draft.expenseComments || []).filter((item) => item.groupId !== id);
      draft.activityLogs = (draft.activityLogs || []).filter((item) => item.groupId !== id);

      return draft;
    });

    if (!deleted) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to delete group" }, { status: 500 });
  }
}
