import { NextResponse } from "next/server";
import { createPasswordResetRequest, normalizeEmail } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/notifications";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { createRequestContext, logError, logInfo, newErrorId } from "@/lib/logger";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many reset requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

export async function POST(request) {
  const ctx = createRequestContext(request, "auth.forgot_password");
  const ip = getClientIp(request);
  try {
    const payload = await parseRequestBody(request, forgotPasswordSchema, {
      invalidJsonMessage: "Invalid forgot-password payload",
    });
    const email = normalizeEmail(payload.email);

    const ipLimit = consumeRateLimit({
      key: `auth:forgot:ip:${ip}`,
      limit: 8,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterMs);

    const emailLimit = consumeRateLimit({
      key: `auth:forgot:email:${email}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterMs);

    const resetRequest = await createPasswordResetRequest(email);
    if (!resetRequest) {
      logInfo("auth.forgot_password_requested", { requestId: ctx.requestId, ip, knownUser: false });
      return NextResponse.json({
        success: true,
        message: "If an account exists for this email, a reset link has been sent.",
      });
    }

    const resetLink = `${new URL(request.url).origin}/reset-password/${resetRequest.token}`;
    try {
      await sendPasswordResetEmail({
        toEmail: resetRequest.user.email,
        resetLink,
      });
    } catch {
      // Keep external response generic to avoid account/email enumeration.
    }

    logInfo("auth.forgot_password_requested", {
      requestId: ctx.requestId,
      ip,
      knownUser: true,
    });

    return NextResponse.json({
      success: true,
      message: "If an account exists for this email, a reset link has been sent.",
    });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    const errorId = newErrorId();
    logError("auth.forgot_password_failed", {
      requestId: ctx.requestId,
      ip,
      errorId,
      message: error instanceof Error ? error.message : "Failed to process forgot-password request",
    });
    return NextResponse.json({ error: "Failed to process forgot-password request", errorId }, { status: 500 });
  }
}
