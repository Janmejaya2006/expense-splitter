import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { updateDB } from "@/lib/store";
import { createRequestContext, errorDetails, logError, logInfo, logWarn, newErrorId } from "@/lib/logger";
import { parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const methodParamsSchema = z.object({
  methodId: z.coerce.number().int().positive("Invalid method id"),
});

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(seconds),
      },
    }
  );
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  const ctx = createRequestContext(request, "payments.methods.delete", {
    userId: Number(session.userId || 0),
  });
  const ip = getClientIp(request);

  try {
    const ipLimit = consumeRateLimit({
      key: `payments:methods:delete:ip:${ip}`,
      limit: 40,
      windowMs: 15 * 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      logWarn("payments.methods.delete_rate_limited_ip", {
        requestId: ctx.requestId,
        ip,
      });
      return rateLimitResponse(ipLimit.retryAfterMs);
    }

    const route = await parseRouteParams(params, methodParamsSchema);
    const methodId = Number(route.methodId);
    const now = new Date().toISOString();
    let found = false;

    await updateDB((draft) => {
      const method = (draft.paymentMethods || []).find(
        (item) => Number(item.id) === methodId && Number(item.userId) === Number(session.userId)
      );
      if (!method) {
        throw new Error("METHOD_NOT_FOUND");
      }

      method.active = false;
      method.updatedAt = now;
      found = true;
      return draft;
    });

    if (!found) {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    logInfo("payments.methods.delete_success", {
      requestId: ctx.requestId,
      userId: Number(session.userId || 0) || null,
      methodId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;
    if (String(error?.message || "") === "METHOD_NOT_FOUND") {
      return NextResponse.json({ error: "Payment method not found" }, { status: 404 });
    }

    const errorId = newErrorId();
    const details = errorDetails(error, "Failed to disconnect payment method");
    logError("payments.methods.delete_failed", {
      requestId: ctx.requestId,
      errorId,
      userId: Number(session.userId || 0) || null,
      methodId: Number(params?.methodId || 0) || null,
      ip,
      message: details.message,
      stack: details.stack,
    });
    return NextResponse.json({ error: "Failed to disconnect payment method", errorId }, { status: 500 });
  }
}
