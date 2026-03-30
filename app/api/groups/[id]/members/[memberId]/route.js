import { NextResponse } from "next/server";
import { groupBundle, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission, normalizeRole, resolveMemberUserIdByEmail } from "@/lib/access";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const memberParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group/member id"),
  memberId: z.coerce.number().int().positive("Invalid group/member id"),
});

const phoneSchema = z
  .string()
  .trim()
  .refine((value) => !value || /^\+?[0-9][0-9\s-]{6,19}$/.test(value), "Enter a valid contact number");

const upiIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => !value || /^[a-z0-9.\-_]{2,256}@[a-z]{2,64}$/i.test(value), "Enter a valid UPI ID (example: name@bank)");

const memberPatchSchema = z
  .object({
    name: z.string().trim().min(1, "Member name cannot be empty").max(120, "Member name is too long").optional(),
    email: z
      .string()
      .trim()
      .max(320, "Email is too long")
      .refine(
        (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        "Enter a valid email address"
      )
      .optional(),
    phone: phoneSchema.optional(),
    upiId: upiIdSchema.optional(),
    role: z.string().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, "Nothing to update");

async function resolveIds(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, memberParamsSchema);
  return {
    groupId: Number(params.id),
    memberId: Number(params.memberId),
  };
}

export async function PATCH(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, memberId } = await resolveIds(params);

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "manageMembers")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await parseRequestBody(request, memberPatchSchema, {
      invalidJsonMessage: "Invalid member payload",
    });
    const hasName = body.name !== undefined;
    const hasEmail = body.email !== undefined;
    const hasPhone = body.phone !== undefined;
    const hasUpiId = body.upiId !== undefined;
    const hasRole = body.role !== undefined;

    const nextName = hasName ? body.name : undefined;
    const nextEmail = hasEmail ? body.email : undefined;
    const nextPhone = hasPhone ? body.phone : undefined;
    const nextUpiId = hasUpiId ? body.upiId : undefined;
    const nextRole = hasRole ? normalizeRole(body.role) : undefined;

    const db = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "manageMembers")) {
        throw new Error("FORBIDDEN");
      }

      const member = draft.members.find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === memberId
      );
      if (!member) {
        throw new Error("NOT_FOUND");
      }

      const isOwner = String(member.role || "").toLowerCase() === "owner";
      if (isOwner && hasRole && nextRole !== "owner") {
        throw new Error("OWNER_ROLE_LOCKED");
      }

      if (hasName) member.name = nextName;
      if (hasEmail) {
        member.email = nextEmail;
        const userId = resolveMemberUserIdByEmail(draft, nextEmail);
        member.userId = Number.isFinite(Number(userId)) ? Number(userId) : null;
      }
      if (hasPhone) member.phone = nextPhone;
      if (hasUpiId) member.upiId = nextUpiId;
      if (hasRole && nextRole !== "owner") member.role = nextRole;

      return draft;
    });

    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ members: group.members });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (error.message === "OWNER_ROLE_LOCKED") {
      return NextResponse.json({ error: "Group owner role cannot be changed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, memberId } = await resolveIds(params);

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "manageMembers")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const db = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "manageMembers")) {
        throw new Error("FORBIDDEN");
      }

      const member = draft.members.find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === memberId
      );
      if (!member) {
        throw new Error("NOT_FOUND");
      }

      if (String(member.role || "").toLowerCase() === "owner") {
        throw new Error("OWNER_MEMBER");
      }

      const hasExpenseDependency = draft.expenses.some(
        (expense) =>
          Number(expense.groupId) === groupId &&
          (Number(expense.payerMemberId) === memberId || (expense.participants || []).includes(memberId))
      );

      if (hasExpenseDependency) {
        throw new Error("HAS_EXPENSES");
      }

      const hasPaymentDependency = (draft.settlementPayments || []).some(
        (payment) =>
          Number(payment.groupId) === groupId &&
          (Number(payment.fromMemberId) === memberId || Number(payment.toMemberId) === memberId)
      );

      if (hasPaymentDependency) {
        throw new Error("HAS_PAYMENTS");
      }

      draft.members = draft.members.filter(
        (item) => !(Number(item.groupId) === groupId && Number(item.id) === memberId)
      );

      return draft;
    });

    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ members: group.members });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    if (error.message === "HAS_EXPENSES") {
      return NextResponse.json(
        { error: "Cannot remove member with linked expenses. Delete/reassign those expenses first." },
        { status: 400 }
      );
    }
    if (error.message === "HAS_PAYMENTS") {
      return NextResponse.json(
        { error: "Cannot remove member with settlement payment history." },
        { status: 400 }
      );
    }
    if (error.message === "OWNER_MEMBER") {
      return NextResponse.json({ error: "Group owner cannot be removed" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to delete member" }, { status: 500 });
  }
}
