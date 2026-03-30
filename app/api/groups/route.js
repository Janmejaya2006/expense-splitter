import { NextResponse } from "next/server";
import { groupsWithStats, nowISO, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { scopeDbForUser } from "@/lib/access";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const groupCreateSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(120, "Group name is too long"),
  description: z.string().optional().default(""),
  currency: z
    .string()
    .optional()
    .default("INR")
    .transform((value) => String(value || "INR").trim().toUpperCase())
    .refine((value) => /^[A-Z]{3}$/.test(value), "Currency must be a valid 3-letter code"),
});

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await readDB();
    const scopedDb = scopeDbForUser(db, session);
    const groups = groupsWithStats(scopedDb);
    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ error: "Failed to load groups" }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const payload = await parseRequestBody(request, groupCreateSchema, {
      invalidJsonMessage: "Invalid group payload",
    });
    const name = payload.name;
    const description = String(payload.description || "").trim();
    const currency = payload.currency;

    let createdId = null;

    const db = await updateDB((draft) => {
      const id = draft.meta.nextGroupId;
      const createdAt = nowISO();
      draft.meta.nextGroupId += 1;
      createdId = id;

      draft.groups.push({
        id,
        name,
        description,
        currency,
        lastMonthlySummaryMonth: "",
        ownerUserId: Number(session.userId || 0) || null,
        createdAt,
      });

      const ownerEmail = String(session.email || "").trim();
      const ownerName = String(session.name || ownerEmail.split("@")[0] || "Owner").trim() || "Owner";
      const ownerUserId = Number(session.userId || 0) || null;

      const existingOwnerMember = draft.members.find(
        (item) =>
          Number(item.groupId) === id &&
          ((ownerUserId && Number(item.userId) === ownerUserId) || String(item.email || "").trim() === ownerEmail)
      );

      if (!existingOwnerMember) {
        const memberId = draft.meta.nextMemberId;
        draft.meta.nextMemberId += 1;

        draft.members.push({
          id: memberId,
          groupId: id,
          name: ownerName,
          email: ownerEmail,
          phone: "",
          upiId: "",
          userId: ownerUserId,
          role: "owner",
          createdAt,
        });
      }

      return draft;
    });

    const group = groupsWithStats(db).find((item) => item.id === createdId);
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
