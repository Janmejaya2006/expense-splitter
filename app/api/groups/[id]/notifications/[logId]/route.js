import { NextResponse } from "next/server";
import { readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const notificationLogParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group/log id"),
  logId: z.coerce.number().int().positive("Invalid group/log id"),
});

async function resolveIds(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, notificationLogParamsSchema);
  return {
    groupId: Number(params.id),
    logId: Number(params.logId),
  };
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, logId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(logId)) {
      return NextResponse.json({ error: "Invalid group/log id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "notifySettlement")) {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }

    await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "notifySettlement")) {
        throw new Error("FORBIDDEN");
      }

      const exists = (draft.notificationLogs || []).some(
        (item) => Number(item.groupId) === groupId && Number(item.id) === logId
      );
      if (!exists) {
        throw new Error("NOT_FOUND");
      }

      draft.notificationLogs = (draft.notificationLogs || []).filter(
        (item) => !(Number(item.groupId) === groupId && Number(item.id) === logId)
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
      return NextResponse.json({ error: "Notification log not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete notification log" }, { status: 500 });
  }
}
