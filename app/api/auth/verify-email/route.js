import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionCookieOptions,
  verifyEmailWithToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const verifyEmailSchema = z.object({
  token: z.string().trim().min(10, "Verification token is required").max(512, "Verification token is invalid"),
});

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many verification attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

export async function POST(request) {
  const ip = getClientIp(request);
  try {
    const payload = await parseRequestBody(request, verifyEmailSchema, {
      invalidJsonMessage: "Invalid email verification payload",
    });

    const ipLimit = consumeRateLimit({
      key: `auth:verify-email:ip:${ip}`,
      limit: 12,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterMs);

    const tokenLimit = consumeRateLimit({
      key: `auth:verify-email:token:${payload.token.slice(0, 40)}`,
      limit: 8,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!tokenLimit.allowed) return rateLimitResponse(tokenLimit.retryAfterMs);

    const user = await verifyEmailWithToken(payload.token);
    const token = createSessionToken(user);
    const response = NextResponse.json({ success: true, user });
    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    return response;
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    if (String(error?.message || "") === "INVALID_VERIFY_TOKEN") {
      return NextResponse.json({ error: "Verification token is invalid or expired" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to verify email" }, { status: 500 });
  }
}
