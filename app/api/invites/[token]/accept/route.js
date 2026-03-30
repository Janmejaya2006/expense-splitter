import { NextResponse } from "next/server";
import { nowISO, readDB, updateDB } from "@/lib/store";
import { hashInviteTokenValue, requireAuth } from "@/lib/auth";
import { normalizeEmail, normalizeRole } from "@/lib/access";
import { parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const inviteTokenParamsSchema = z.object({
  token: z
    .string()
    .trim()
    .min(20, "Invalid invite token")
    .max(256, "Invalid invite token")
    .regex(/^[A-Za-z0-9_-]+$/, "Invalid invite token"),
});

function hashInviteToken(token) {
  return hashInviteTokenValue(token);
}

async function resolveToken(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, inviteTokenParamsSchema);
  return String(params.token || "").trim();
}

export async function POST(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const token = await resolveToken(params);
    if (!token) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
    }

    const tokenHash = hashInviteToken(token);
    const db = await readDB();
    const invite = (db.groupInvites || []).find((item) => String(item.tokenHash || "") === tokenHash);
    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    if (invite.acceptedAt) {
      return NextResponse.json({ error: "Invite has already been accepted" }, { status: 409 });
    }

    if (new Date(invite.expiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
    }

    const sessionEmail = normalizeEmail(session.email);
    const inviteEmail = normalizeEmail(invite.email);
    if (!sessionEmail || !inviteEmail || sessionEmail !== inviteEmail) {
      return NextResponse.json(
        { error: `Login with ${invite.email} to accept this invite.` },
        { status: 403 }
      );
    }

    let joinedGroup = null;

    await updateDB((draft) => {
      const liveInvite = (draft.groupInvites || []).find((item) => Number(item.id) === Number(invite.id));
      if (!liveInvite) throw new Error("INVITE_NOT_FOUND");
      if (liveInvite.acceptedAt) throw new Error("INVITE_ACCEPTED");
      if (new Date(liveInvite.expiresAt).getTime() <= Date.now()) throw new Error("INVITE_EXPIRED");

      const group = (draft.groups || []).find((item) => Number(item.id) === Number(liveInvite.groupId));
      if (!group) throw new Error("GROUP_NOT_FOUND");

      const role = normalizeRole(liveInvite.role);
      const existingMember = (draft.members || []).find(
        (item) =>
          Number(item.groupId) === Number(group.id) &&
          (Number(item.userId || 0) === Number(session.userId || 0) ||
            normalizeEmail(item.email) === sessionEmail)
      );

      if (existingMember) {
        existingMember.email = sessionEmail;
        existingMember.userId = Number(session.userId || 0) || null;
        if (String(existingMember.role || "") !== "owner" && role !== "owner") {
          existingMember.role = role;
        }
      } else {
        const id = Number(draft.meta.nextMemberId);
        draft.meta.nextMemberId += 1;

        draft.members.push({
          id,
          groupId: Number(group.id),
          name: String(session.name || session.email || "Member").trim(),
          email: sessionEmail,
          phone: "",
          userId: Number(session.userId || 0) || null,
          role: role === "owner" ? "admin" : role,
          createdAt: nowISO(),
        });
      }

      liveInvite.acceptedAt = nowISO();
      liveInvite.acceptedByUserId = Number(session.userId || 0) || null;
      liveInvite.status = "accepted";

      joinedGroup = {
        id: Number(group.id),
        name: group.name,
      };

      return draft;
    });

    return NextResponse.json({
      success: true,
      group: joinedGroup,
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "INVITE_ACCEPTED") {
      return NextResponse.json({ error: "Invite has already been accepted" }, { status: 409 });
    }
    if (error.message === "INVITE_EXPIRED") {
      return NextResponse.json({ error: "Invite has expired" }, { status: 400 });
    }
    if (error.message === "INVITE_NOT_FOUND") {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    if (error.message === "GROUP_NOT_FOUND") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 500 });
  }
}
