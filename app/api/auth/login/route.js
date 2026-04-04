import { NextResponse } from "next/server";
import {
  authenticateUser,
  createLoginOtpChallenge,
  createSessionToken,
  getSessionCookieOptions,
  isOtpLoginEnabled,
  revokeLoginOtpChallenge,
  verifyLoginOtpChallenge,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { sendLoginOtpEmail } from "@/lib/notifications";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { createRequestContext, errorDetails, logError, logInfo, logWarn, newErrorId } from "@/lib/logger";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const loginSchema = z.object({
  mode: z.enum(["request_otp", "verify_otp"]).default("request_otp"),
  email: z.string().trim().email("Enter a valid email address").optional(),
  password: z.string().max(128, "Password is too long").optional(),
  challengeToken: z.string().trim().max(512, "Challenge token is invalid").optional(),
  otp: z.string().trim().max(12, "OTP is invalid").optional(),
});

function maskEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  const [local = "", domain = ""] = value.split("@");
  if (!local || !domain) return value;
  if (local.length <= 2) {
    return `${local[0] || "*"}*@${domain}`;
  }
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many login attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(seconds) } }
  );
}

export async function POST(request) {
  const ctx = createRequestContext(request, "auth.login");
  const ip = getClientIp(request);
  const enforceRateLimit = process.env.NODE_ENV === "production";
  try {
    const body = await parseRequestBody(request, loginSchema, {
      invalidJsonMessage: "Invalid login payload",
    });
    const mode = String(body.mode || "request_otp").trim().toLowerCase();

    if (mode === "verify_otp") {
      const challengeToken = String(body.challengeToken || "").trim();
      const otp = String(body.otp || "").trim();

      if (enforceRateLimit) {
        const verifyIpLimit = consumeRateLimit({
          key: `auth:login:verify-ip:${ip}`,
          limit: 20,
          windowMs: 15 * 60 * 1000,
          blockDurationMs: 15 * 60 * 1000,
        });
        if (!verifyIpLimit.allowed) return rateLimitResponse(verifyIpLimit.retryAfterMs);
      }

      if (enforceRateLimit) {
        const challengeLimit = consumeRateLimit({
          key: `auth:login:challenge:${challengeToken || "unknown"}`,
          limit: 10,
          windowMs: 15 * 60 * 1000,
          blockDurationMs: 15 * 60 * 1000,
        });
        if (!challengeLimit.allowed) return rateLimitResponse(challengeLimit.retryAfterMs);
      }

      if (!challengeToken || !otp) {
        return NextResponse.json({ error: "Challenge token and OTP are required" }, { status: 400 });
      }

      try {
        const user = await verifyLoginOtpChallenge(challengeToken, otp);
        if (!user) {
          return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
        }

        const token = createSessionToken(user);
        const response = NextResponse.json({
          success: true,
          user,
          requiresOtp: false,
        });

        response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
        logInfo("auth.login_success_otp", {
          requestId: ctx.requestId,
          userId: Number(user?.id || 0) || null,
          ip,
        });
        return response;
      } catch (error) {
        const code = String(error?.message || "");
        if (code === "INVALID_OTP") {
          logWarn("auth.login_invalid_otp_payload", { requestId: ctx.requestId, ip });
          return NextResponse.json({ error: "Enter the 6-digit OTP sent to your email." }, { status: 400 });
        }
        if (code === "OTP_INVALID") {
          logWarn("auth.login_otp_mismatch", { requestId: ctx.requestId, ip });
          return NextResponse.json({ error: "Incorrect OTP. Please try again." }, { status: 401 });
        }
        if (code === "OTP_ATTEMPTS_EXCEEDED") {
          logWarn("auth.login_otp_attempts_exceeded", { requestId: ctx.requestId, ip });
          return NextResponse.json(
            { error: "Too many incorrect OTP attempts. Request a new code." },
            { status: 429 }
          );
        }
        if (code === "OTP_EXPIRED" || code === "OTP_ALREADY_USED" || code === "INVALID_OTP_CHALLENGE") {
          logWarn("auth.login_otp_expired_or_invalid", { requestId: ctx.requestId, ip });
          return NextResponse.json(
            { error: "OTP expired or invalid. Please request a fresh verification code." },
            { status: 400 }
          );
        }
        throw error;
      }
    }

    if (mode !== "request_otp") {
      return NextResponse.json({ error: "Invalid login mode" }, { status: 400 });
    }

    const email = String(body.email || "").trim();
    const password = String(body.password || "");

    if (enforceRateLimit) {
      const requestIpLimit = consumeRateLimit({
        key: `auth:login:request-ip:${ip}`,
        limit: 14,
        windowMs: 15 * 60 * 1000,
        blockDurationMs: 15 * 60 * 1000,
      });
      if (!requestIpLimit.allowed) return rateLimitResponse(requestIpLimit.retryAfterMs);
    }

    const emailKey = String(email || "").toLowerCase();
    if (enforceRateLimit) {
      const requestEmailLimit = consumeRateLimit({
        key: `auth:login:request-email:${emailKey || "unknown"}`,
        limit: 10,
        windowMs: 15 * 60 * 1000,
        blockDurationMs: 15 * 60 * 1000,
      });
      if (!requestEmailLimit.allowed) return rateLimitResponse(requestEmailLimit.retryAfterMs);
    }

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (!isOtpLoginEnabled()) {
      let user = null;
      try {
        user = await authenticateUser(email, password);
      } catch (error) {
        if (String(error?.message || "") === "EMAIL_NOT_VERIFIED") {
          return NextResponse.json(
            { error: "Please verify your email before logging in." },
            { status: 403 }
          );
        }
        throw error;
      }
      if (!user) {
        logWarn("auth.login_invalid_credentials", { requestId: ctx.requestId, ip, email: maskEmail(email) });
        return NextResponse.json({ error: "Invalid login credentials" }, { status: 401 });
      }

      const token = createSessionToken(user);
      const response = NextResponse.json({
        success: true,
        user,
        requiresOtp: false,
      });

      response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
      logInfo("auth.login_success_password", {
        requestId: ctx.requestId,
        userId: Number(user?.id || 0) || null,
        ip,
      });
      return response;
    }

    let challenge = null;
    try {
      challenge = await createLoginOtpChallenge(email, password);
    } catch (error) {
      if (String(error?.message || "") === "EMAIL_NOT_VERIFIED") {
        return NextResponse.json(
          { error: "Please verify your email before logging in." },
          { status: 403 }
        );
      }
      throw error;
    }
    if (!challenge) {
      logWarn("auth.login_invalid_credentials", { requestId: ctx.requestId, ip, email: maskEmail(email) });
      return NextResponse.json({ error: "Invalid login credentials" }, { status: 401 });
    }

    try {
      await sendLoginOtpEmail({
        toEmail: challenge.user?.email || email,
        otpCode: challenge.otpCode,
        expiresAt: challenge.expiresAt,
      });
    } catch {
      if (process.env.NODE_ENV !== "production") {
        logWarn("auth.login_otp_delivery_preview_fallback", {
          requestId: ctx.requestId,
          ip,
          email: maskEmail(email),
        });
        return NextResponse.json({
          success: true,
          requiresOtp: true,
          challengeToken: challenge.challengeToken,
          expiresAt: challenge.expiresAt,
          maskedEmail: maskEmail(challenge.user?.email || email),
          delivery: {
            channel: "email",
            status: "preview",
            message: "Email provider unavailable in development. Use the preview OTP below.",
          },
          previewOtpCode: challenge.otpCode,
        });
      }

      await revokeLoginOtpChallenge(challenge.challengeToken);
      logError("auth.login_otp_delivery_failed", {
        requestId: ctx.requestId,
        ip,
        email: maskEmail(email),
      });
      return NextResponse.json(
        {
          error: "Could not send login OTP email. Check email provider configuration and try again.",
        },
        { status: 503 }
      );
    }

    logInfo("auth.login_otp_requested", {
      requestId: ctx.requestId,
      ip,
      userId: Number(challenge.user?.id || 0) || null,
    });

    return NextResponse.json({
      success: true,
      requiresOtp: true,
      challengeToken: challenge.challengeToken,
      expiresAt: challenge.expiresAt,
      maskedEmail: maskEmail(challenge.user?.email || email),
      delivery: {
        channel: "email",
        status: "sent",
        message: "Verification code sent to your email.",
      },
    });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    const errorId = newErrorId();
    const details = errorDetails(error, "Failed to login");
    logError("auth.login_failed", {
      requestId: ctx.requestId,
      errorId,
      ip,
      message: details.message,
      stack: details.stack,
    });
    return NextResponse.json({ error: "Failed to login", errorId }, { status: 500 });
  }
}

export async function GET(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  return NextResponse.json({ authenticated: Boolean(session), session });
}
