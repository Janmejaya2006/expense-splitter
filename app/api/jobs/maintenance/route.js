import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireAuth } from "@/lib/auth";
import { runMaintenanceJobs } from "@/lib/jobs";
import { createRequestContext, errorDetails, logError, logInfo, newErrorId } from "@/lib/logger";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const maintenanceSchema = z.object({
  notificationLimit: z.coerce.number().int().min(1).max(200).optional().default(25),
});

function safeCompare(valueA, valueB) {
  const a = Buffer.from(String(valueA || ""));
  const b = Buffer.from(String(valueB || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hasValidJobSecret(request) {
  const expected = String(process.env.JOB_RUNNER_SECRET || "").trim();
  if (!expected) return false;
  const supplied = String(request.headers.get("x-job-secret") || "").trim();
  return Boolean(supplied && safeCompare(supplied, expected));
}

export async function POST(request) {
  const ip = getClientIp(request);
  const limit = consumeRateLimit({
    key: `jobs:maintenance:ip:${ip}`,
    limit: 8,
    windowMs: 60 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  });
  if (!limit.allowed) {
    const seconds = Math.max(1, Math.ceil(Number(limit.retryAfterMs || 0) / 1000));
    return NextResponse.json(
      { error: "Too many maintenance job requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(seconds) } }
    );
  }

  const hasJobSecretConfigured = Boolean(String(process.env.JOB_RUNNER_SECRET || "").trim());
  const authorizedBySecret = hasValidJobSecret(request);
  if (process.env.NODE_ENV === "production" && !hasJobSecretConfigured) {
    return NextResponse.json({ error: "JOB_RUNNER_SECRET is required in production" }, { status: 503 });
  }
  if (process.env.NODE_ENV === "production" && !authorizedBySecret) {
    return NextResponse.json({ error: "Unauthorized job secret" }, { status: 401 });
  }
  const auth = authorizedBySecret ? { session: null, unauthorized: null } : requireAuth(request);
  if (auth.unauthorized) return auth.unauthorized;

  const ctx = createRequestContext(request, "jobs.maintenance", {
    userId: Number(auth.session?.userId || 0) || null,
    mode: authorizedBySecret ? "secret" : "session",
  });

  try {
    const payload = await parseRequestBody(request, maintenanceSchema, {
      invalidJsonMessage: "Invalid maintenance payload",
    });
    const notificationLimit = Number(payload.notificationLimit || 25);
    const result = await runMaintenanceJobs({
      notificationLimit: Number.isFinite(notificationLimit) && notificationLimit > 0 ? notificationLimit : 25,
    });

    logInfo("jobs.maintenance_ok", {
      requestId: ctx.requestId,
      ...result,
    });
    return NextResponse.json(result);
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to run maintenance jobs");
    logError("jobs.maintenance_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
