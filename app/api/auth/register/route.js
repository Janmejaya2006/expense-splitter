import { NextResponse } from "next/server";
import {
  createEmailVerificationRequest,
  createSessionToken,
  getSessionCookieOptions,
  isEmailVerificationRequired,
  normalizeEmail,
  registerUser,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { sendEmailVerificationEmail } from "@/lib/notifications";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine((value) => !value || /^\+?[0-9][0-9\s-]{6,19}$/.test(value), "Enter a valid contact number"),
  password: z.string().min(8, "Password must be at least 8 characters long").max(128, "Password is too long"),
});

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many registration attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

export async function POST(request) {
  try {
    const payload = await parseRequestBody(request, registerSchema, {
      invalidJsonMessage: "Invalid registration payload",
    });
    const ip = getClientIp(request);
    const cleanEmail = normalizeEmail(payload.email);

    const ipLimit = consumeRateLimit({
      key: `auth:register:ip:${ip}`,
      limit: 6,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfterMs);

    const emailLimit = consumeRateLimit({
      key: `auth:register:email:${cleanEmail}`,
      limit: 5,
      windowMs: 60 * 60 * 1000,
      blockDurationMs: 30 * 60 * 1000,
    });
    if (!emailLimit.allowed) return rateLimitResponse(emailLimit.retryAfterMs);

    const user = await registerUser({
      name: payload.name,
      email: cleanEmail,
      phone: payload.phone,
      password: payload.password,
    });

    if (isEmailVerificationRequired()) {
      const verification = await createEmailVerificationRequest(user.email);
      const verifyLink = verification?.token
        ? `${new URL(request.url).origin}/verify-email/${verification.token}`
        : "";
      let delivery = { status: "sent" };
      let verificationPreviewUrl = "";
      if (verifyLink) {
        try {
          await sendEmailVerificationEmail({
            toEmail: user.email,
            verifyLink,
          });
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            delivery = {
              status: "preview",
              message: "Email provider unavailable in development. Use preview verification link.",
            };
            verificationPreviewUrl = verifyLink;
          } else {
            delivery = { status: "failed", message: error.message || "Email delivery failed" };
          }
        }
      }

      return NextResponse.json(
        {
          success: true,
          user,
          requiresEmailVerification: true,
          verificationDelivery: delivery,
          verificationPreviewUrl,
        },
        { status: 201 }
      );
    }

    const token = createSessionToken(user);
    const response = NextResponse.json({ success: true, user }, { status: 201 });
    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    return response;
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    const message = String(error.message || "Failed to register");

    if (message === "NAME_REQUIRED") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (message === "EMAIL_REQUIRED") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    if (message.includes("Password")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ error: "Failed to register" }, { status: 500 });
  }
}
