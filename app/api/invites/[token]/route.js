import { NextResponse } from "next/server";
import { readDB } from "@/lib/store";
import { hashInviteTokenValue } from "@/lib/auth";
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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function resolveToken(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, inviteTokenParamsSchema);
  return String(params.token || "").trim();
}

export async function GET(_request, { params }) {
  try {
    const token = await resolveToken(params);
    if (!token) {
      return NextResponse.json({ error: "Invalid invite token" }, { status: 400 });
    }

    const db = await readDB();
    const invite = (db.groupInvites || []).find((item) => String(item.tokenHash || "") === hashInviteToken(token));
    if (!invite) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    const group = (db.groups || []).find((item) => Number(item.id) === Number(invite.groupId));
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const expired = new Date(invite.expiresAt).getTime() <= Date.now();
    const accepted = Boolean(invite.acceptedAt);
    const status = accepted ? "accepted" : expired ? "expired" : "pending";

    return NextResponse.json({
      invite: {
        id: invite.id,
        email: normalizeEmail(invite.email),
        role: invite.role || "member",
        status,
        expiresAt: invite.expiresAt,
        group: {
          id: group.id,
          name: group.name,
          description: group.description || "",
        },
      },
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load invite" }, { status: 500 });
  }
}
