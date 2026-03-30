import { NextResponse } from "next/server";
import { readDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { enqueueRetryFromLog, processNotificationQueue } from "@/lib/notificationQueue";
import { createRequestContext, errorDetails, logError, logInfo, newErrorId } from "@/lib/logger";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

async function resolveGroupId(paramsPromise) {
  const params = await parseRouteParams(
    paramsPromise,
    z.object({
      id: z.coerce.number().int().positive("Invalid group id"),
    })
  );
  return Number(params.id);
}

const retrySchema = z.object({
  logId: z.coerce.number().int().positive("logId is required"),
});

export async function POST(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;
  const ctx = createRequestContext(request, "groups.notifications.retry", {
    userId: Number(session.userId || 0),
  });

  try {
    const groupId = await resolveGroupId(params);
    if (!Number.isFinite(groupId)) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
    }

    const payload = await parseRequestBody(request, retrySchema, {
      invalidJsonMessage: "Invalid retry payload",
    });
    const logId = Number(payload.logId);

    const db = await readDB();
    if (!hasGroupPermission(db, groupId, session, "notifySettlement")) {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }

    const queued = await enqueueRetryFromLog({ groupId, logId });
    const queueResult = await processNotificationQueue({
      groupId,
      jobIds: [Number(queued?.job?.id)],
      limit: 1,
    });

    const refreshed = await readDB();
    const createdLog = (refreshed.notificationLogs || []).find(
      (item) => Number(item.groupId) === groupId && Number(item.id) === Number(queued?.log?.id)
    );

    const processed = queueResult.processed?.[0] || null;
    const success = processed?.status === "sent";
    const statusCode = success ? 200 : 400;

    logInfo("notifications.retry_processed", {
      requestId: ctx.requestId,
      groupId,
      sourceLogId: logId,
      retryLogId: Number(createdLog?.id || 0),
      status: processed?.status || "unknown",
    });

    return NextResponse.json(
      {
        success,
        log: createdLog || null,
        delivery: processed
          ? {
              channel: processed.channel,
              status: processed.status,
              message: processed.message,
            }
          : null,
      },
      { status: statusCode }
    );
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error instanceof Error && error.message === "Notification log not found") {
      return NextResponse.json({ error: "Notification log not found" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "Only email/sms/whatsapp logs can be retried") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to retry notification");
    logError("notifications.retry_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
