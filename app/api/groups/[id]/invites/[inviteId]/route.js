import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission, normalizeRole } from "@/lib/access";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

function sanitizeInvite(invite) {
  if (!invite) return null;
  return {
    id: Number(invite.id),
    groupId: Number(invite.groupId),
    email: String(invite.email || ""),
    role: String(invite.role || "member"),
    status: String(invite.status || "pending"),
    createdByUserId: Number(invite.createdByUserId || 0) || null,
    createdAt: String(invite.createdAt || ""),
    expiresAt: String(invite.expiresAt || ""),
    acceptedAt: invite.acceptedAt || null,
    acceptedByUserId: Number(invite.acceptedByUserId || 0) || null,
    emailDelivery: invite.emailDelivery || null,
  };
}

async function resolveIds(paramsPromise) {
  const params = await parseRouteParams(
    paramsPromise,
    z.object({
      id: z.coerce.number().int().positive("Invalid group/invite id"),
      inviteId: z.coerce.number().int().positive("Invalid group/invite id"),
    })
  );
  return {
    groupId: Number(params.id),
    inviteId: Number(params.inviteId),
  };
}

const invitePatchSchema = z
  .object({
    role: z.string().optional(),
    status: z.string().trim().toLowerCase().optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, "Nothing to update");

export async function PATCH(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, inviteId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(inviteId)) {
      return NextResponse.json({ error: "Invalid group/invite id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "inviteMembers")) {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }

    const body = await parseRequestBody(request, invitePatchSchema, {
      invalidJsonMessage: "Invalid invite payload",
    });
    const hasRole = body.role !== undefined;
    const hasStatus = body.status !== undefined;

    const nextRole = hasRole ? normalizeRole(body.role) : undefined;
    const safeRole = nextRole === "owner" ? "admin" : nextRole;
    const nextStatus = hasStatus ? String(body.status || "").trim().toLowerCase() : undefined;
    if (hasStatus && !["pending", "revoked"].includes(nextStatus)) {
      return NextResponse.json({ error: "Status must be pending or revoked" }, { status: 400 });
    }

    let updatedInvite = null;

    await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "inviteMembers")) {
        throw new Error("FORBIDDEN");
      }

      const invite = (draft.groupInvites || []).find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === inviteId
      );
      if (!invite) {
        throw new Error("NOT_FOUND");
      }

      if (String(invite.status || "").toLowerCase() === "accepted") {
        throw new Error("ALREADY_ACCEPTED");
      }

      if (hasRole) invite.role = safeRole;
      if (hasStatus) invite.status = nextStatus;
      updatedInvite = sanitizeInvite(invite);
      return draft;
    });

    return NextResponse.json({ invite: updatedInvite });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (error.message === "ALREADY_ACCEPTED") {
      return NextResponse.json({ error: "Accepted invites cannot be edited" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update invite" }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, inviteId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(inviteId)) {
      return NextResponse.json({ error: "Invalid group/invite id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "inviteMembers")) {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }

    await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "inviteMembers")) {
        throw new Error("FORBIDDEN");
      }

      const invite = (draft.groupInvites || []).find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === inviteId
      );
      if (!invite) {
        throw new Error("NOT_FOUND");
      }
      if (String(invite.status || "").toLowerCase() === "accepted") {
        throw new Error("ALREADY_ACCEPTED");
      }

      draft.groupInvites = (draft.groupInvites || []).filter(
        (item) => !(Number(item.groupId) === groupId && Number(item.id) === inviteId)
      );
      return draft;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (error.message === "ALREADY_ACCEPTED") {
      return NextResponse.json({ error: "Accepted invites cannot be deleted" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to delete invite" }, { status: 500 });
  }
}
