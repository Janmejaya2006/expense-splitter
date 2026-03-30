import { NextResponse } from "next/server";
import { createEmailVerificationRequest, normalizeEmail } from "@/lib/auth";
import { sendEmailVerificationEmail } from "@/lib/notifications";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const resendSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many verification email requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

export async function POST(request) {
  const ip = getClientIp(request);
  try {
    const payload = await parseRequestBody(request, resendSchema, {
      invalidJsonMessage: "Invalid resend payload",
    });
    const email = normalizeEmail(payload.email);

    const ipLimit = consumeRateLimit({
      key: `auth:verify-email-resend:ip:${ip}`,
      limit: 8,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterMs);

    const emailLimit = consumeRateLimit({
      key: `auth:verify-email-resend:email:${email}`,
      limit: 4,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterMs);

    const verification = await createEmailVerificationRequest(email);
    if (verification?.token) {
      const verifyLink = `${new URL(request.url).origin}/verify-email/${verification.token}`;
      try {
        await sendEmailVerificationEmail({
          toEmail: email,
          verifyLink,
        });
      } catch {
        // Keep response generic to avoid account enumeration.
      }
    }

    return NextResponse.json({
      success: true,
      message: "If an unverified account exists for this email, a verification link has been sent.",
    });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;
    return NextResponse.json({ error: "Failed to resend verification email" }, { status: 500 });
  }
}
