import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionCookieOptions,
  resetPasswordWithToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { createRequestContext, errorDetails, logError, logInfo, newErrorId } from "@/lib/logger";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const resetPasswordSchema = z.object({
  token: z.string().trim().min(10, "Token and new password are required").max(512, "Reset token is invalid"),
  password: z.string().min(8, "Password must be at least 8 characters long").max(128, "Password is too long"),
});

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many reset attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

export async function POST(request) {
  const ctx = createRequestContext(request, "auth.reset_password");
  const ip = getClientIp(request);
  try {
    const payload = await parseRequestBody(request, resetPasswordSchema, {
      invalidJsonMessage: "Invalid reset-password payload",
    });
    const token = payload.token;
    const password = payload.password;

    const ipLimit = consumeRateLimit({
      key: `auth:reset:ip:${ip}`,
      limit: 10,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterMs);

    const tokenLimit = consumeRateLimit({
      key: `auth:reset:token:${token.slice(0, 40)}`,
      limit: 6,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!tokenLimit.allowed) return rateLimitResponse(tokenLimit.retryAfterMs);

    const user = await resetPasswordWithToken(token, password);
    const sessionToken = createSessionToken(user);

    const response = NextResponse.json({
      success: true,
      user,
    });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
    logInfo("auth.reset_password_success", {
      requestId: ctx.requestId,
      userId: Number(user?.id || 0) || null,
      ip,
    });
    return response;
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    const message = String(error.message || "Failed to reset password");
    if (message === "INVALID_RESET_TOKEN") {
      return NextResponse.json({ error: "Reset token is invalid or expired" }, { status: 400 });
    }
    if (message.includes("Password")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    const errorId = newErrorId();
    const details = errorDetails(error, "Failed to reset password");
    logError("auth.reset_password_failed", {
      requestId: ctx.requestId,
      ip,
      errorId,
      message: details.message,
      stack: details.stack,
    });
    return NextResponse.json({ error: "Failed to reset password", errorId }, { status: 500 });
  }
}
