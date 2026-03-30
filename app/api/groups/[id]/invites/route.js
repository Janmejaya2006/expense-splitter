import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { groupBundle, nowISO, readDB, updateDB } from "@/lib/store";
import { hashInviteTokenValue, requireAuth } from "@/lib/auth";
import { hasGroupPermission, normalizeEmail, normalizeRole } from "@/lib/access";
import { sendGroupInviteEmail } from "@/lib/notifications";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const groupParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group id"),
});
const inviteCreateSchema = z.object({
  email: z.string().trim().email("Invite email is required"),
  role: z.string().optional(),
});

function hashInviteToken(token) {
  return hashInviteTokenValue(token);
}

function createInviteToken() {
  return crypto.randomBytes(24).toString("base64url");
}

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

async function resolveGroupId(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, groupParamsSchema);
  return Number(params.id);
}

export async function GET(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const groupId = await resolveGroupId(params);
    if (!Number.isFinite(groupId)) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
    }

    const db = await readDB();
    if (!hasGroupPermission(db, groupId, session, "inviteMembers")) {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }

    const invites = (db.groupInvites || [])
      .filter((item) => Number(item.groupId) === groupId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((item) => sanitizeInvite(item));

    return NextResponse.json({ invites });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load invites" }, { status: 500 });
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

    const db = await readDB();
    if (!hasGroupPermission(db, groupId, session, "inviteMembers")) {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }

    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await parseRequestBody(request, inviteCreateSchema, {
      invalidJsonMessage: "Invalid invite payload",
    });
    const email = normalizeEmail(body.email);
    const roleRaw = normalizeRole(body.role);
    const role = roleRaw === "owner" ? "admin" : roleRaw;

    const alreadyMember = (group.members || []).some(
      (item) => normalizeEmail(item.email) && normalizeEmail(item.email) === email
    );
    if (alreadyMember) {
      return NextResponse.json({ error: "This email is already a member of the group" }, { status: 409 });
    }

    const rawToken = createInviteToken();
    const tokenHash = hashInviteToken(rawToken);
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
    const inviteLink = `${new URL(request.url).origin}/invite/${rawToken}`;

    let savedInvite = null;

    await updateDB((draft) => {
      const id = Number(draft.meta.nextGroupInviteId);
      draft.meta.nextGroupInviteId += 1;

      savedInvite = {
        id,
        groupId,
        email,
        role,
        tokenHash,
        status: "pending",
        createdByUserId: Number(session.userId || 0) || null,
        createdAt: nowISO(),
        expiresAt,
        acceptedAt: null,
        acceptedByUserId: null,
        emailDelivery: null,
      };

      draft.groupInvites.push(savedInvite);
      return draft;
    });

    let emailDelivery = null;
    try {
      const delivery = await sendGroupInviteEmail({
        toEmail: email,
        groupName: group.name,
        inviterName: session.name || session.email,
        inviteLink,
        role,
      });
      emailDelivery = { status: "sent", ...delivery };
    } catch (error) {
      emailDelivery = { status: "failed", message: error.message || "Invite email failed" };
    }

    await updateDB((draft) => {
      const invite = (draft.groupInvites || []).find(
        (item) =>
          Number(item.groupId) === groupId &&
          Number(item.id) === Number(savedInvite?.id)
      );
      if (invite) {
        invite.emailDelivery = emailDelivery;
      }
      return draft;
    });

    return NextResponse.json(
      {
        invite: sanitizeInvite({ ...savedInvite, emailDelivery }),
        inviteLink,
      },
      { status: 201 }
    );
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to create invite" }, { status: 500 });
  }
}
