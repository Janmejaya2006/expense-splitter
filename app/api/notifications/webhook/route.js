import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { nowISO, updateDB } from "@/lib/store";
import { createRequestContext, errorDetails, logError, logInfo, newErrorId } from "@/lib/logger";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const webhookSchema = z.object({
  provider: z.string().trim().max(64).optional().default(""),
  providerId: z.string().trim().max(160).optional(),
  id: z.string().trim().max(160).optional(),
  sid: z.string().trim().max(160).optional(),
  status: z.string().trim().max(80).optional().default(""),
  event: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().max(400).optional(),
});

function safeCompare(valueA, valueB) {
  const a = Buffer.from(String(valueA || ""));
  const b = Buffer.from(String(valueB || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (["delivered", "sent", "queued", "read"].includes(status)) return "sent";
  if (["failed", "undelivered", "bounced", "rejected"].includes(status)) return "failed";
  return status || "unknown";
}

export async function POST(request) {
  const ctx = createRequestContext(request, "notifications.webhook");
  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit({
      key: `notifications:webhook:ip:${ip}`,
      limit: 120,
      windowMs: 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });
    if (!limit.allowed) {
      const seconds = Math.max(1, Math.ceil(Number(limit.retryAfterMs || 0) / 1000));
      return NextResponse.json(
        { error: "Too many webhook requests." },
        { status: 429, headers: { "Retry-After": String(seconds) } }
      );
    }

    const payload = await parseRequestBody(request, webhookSchema, {
      invalidJsonMessage: "Invalid webhook payload",
    });
    const secret = String(request.headers.get("x-webhook-secret") || "").trim();
    const expectedSecret = String(process.env.NOTIFICATION_WEBHOOK_SECRET || "").trim();

    if (process.env.NODE_ENV === "production" && !expectedSecret) {
      return NextResponse.json({ error: "NOTIFICATION_WEBHOOK_SECRET is required in production" }, { status: 503 });
    }

    if (expectedSecret && !safeCompare(secret, expectedSecret)) {
      return NextResponse.json({ error: "Unauthorized webhook secret" }, { status: 401 });
    }

    const provider = String(payload.provider || "").trim().toLowerCase();
    const providerId = String(payload.providerId || payload.id || payload.sid || "").trim();
    const providerStatus = String(payload.status || payload.event || "").trim();

    if (!provider || !providerId) {
      return NextResponse.json({ error: "provider and providerId are required" }, { status: 400 });
    }

    let updated = null;
    await updateDB((draft) => {
      const log = [...(draft.notificationLogs || [])]
        .reverse()
        .find(
          (item) =>
            String(item.provider || "").toLowerCase() === provider &&
            String(item.providerId || "") === providerId
        );

      if (!log) {
        return draft;
      }

      log.webhookStatus = providerStatus || "updated";
      log.webhookUpdatedAt = nowISO();
      log.status = normalizeStatus(providerStatus);
      if (payload.message) {
        log.message = String(payload.message);
      }

      const queueJob = [...(draft.notificationQueue || [])]
        .reverse()
        .find((item) => Number(item.logId) === Number(log.id));
      if (queueJob) {
        queueJob.status = log.status === "sent" ? "sent" : log.status === "failed" ? "failed" : queueJob.status;
        queueJob.updatedAt = nowISO();
        if (log.status === "failed" && !queueJob.completedAt) {
          queueJob.completedAt = nowISO();
          queueJob.lastError = String(payload.message || providerStatus || "Provider marked delivery as failed");
        }
      }

      updated = {
        id: log.id,
        status: log.status,
        webhookStatus: log.webhookStatus,
      };

      return draft;
    });

    logInfo("notifications.webhook_processed", {
      requestId: ctx.requestId,
      provider,
      providerId,
      status: providerStatus,
      updatedLogId: Number(updated?.id || 0) || null,
    });

    return NextResponse.json({
      success: true,
      updated,
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to process webhook");
    logError("notifications.webhook_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
