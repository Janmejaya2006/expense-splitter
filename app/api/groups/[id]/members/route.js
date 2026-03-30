import { NextResponse } from "next/server";
import { groupBundle, nowISO, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup, hasGroupPermission, normalizeRole, resolveMemberUserIdByEmail } from "@/lib/access";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const groupParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group id"),
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

const memberCreateSchema = z.object({
  name: z.string().trim().min(1, "Member name is required").max(120, "Member name is too long"),
  email: z.string().trim().max(320, "Email is too long").optional().default(""),
  phone: phoneSchema.optional().default(""),
  upiId: upiIdSchema.optional().default(""),
  role: z.string().optional().default("member"),
});

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

    return NextResponse.json({ members: group.members });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load members" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const groupId = await resolveGroupId(params);

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "manageMembers")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const payload = await parseRequestBody(request, memberCreateSchema, {
      invalidJsonMessage: "Invalid member payload",
    });
    const name = payload.name;
    const email = payload.email;
    const phone = payload.phone;
    const upiId = payload.upiId;
    const role = normalizeRole(payload.role) === "owner" ? "admin" : normalizeRole(payload.role);

    const db = await updateDB((draft) => {
      const group = draft.groups.find((item) => item.id === groupId);
      if (!group) return draft;

      if (!hasGroupPermission(draft, groupId, session, "manageMembers")) {
        throw new Error("FORBIDDEN");
      }

      const id = draft.meta.nextMemberId;
      draft.meta.nextMemberId += 1;
      const userId = resolveMemberUserIdByEmail(draft, email);

      draft.members.push({
        id,
        groupId,
        name,
        email,
        phone,
        upiId,
        userId: Number.isFinite(Number(userId)) ? Number(userId) : null,
        role,
        createdAt: nowISO(),
      });

      return draft;
    });

    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ members: group.members }, { status: 201 });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
