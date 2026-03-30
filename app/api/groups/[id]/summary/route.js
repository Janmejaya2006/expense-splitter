import { NextResponse } from "next/server";
import { groupBundle, readDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup } from "@/lib/access";
import { parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const groupParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group id"),
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
    if (!Number.isFinite(groupId)) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
    }

    const db = await readDB();
    if (!canAccessGroup(db, groupId, session)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = groupBundle(db, groupId);

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ summary: group.summary });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load summary" }, { status: 500 });
  }
}
