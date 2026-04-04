import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
  upsertGoogleUser,
} from "@/lib/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { createRequestContext, errorDetails, logError, logInfo, logWarn, newErrorId } from "@/lib/logger";
import {
  clearGoogleOAuthCookieOptions,
  getGoogleOAuthConfig,
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  normalizeReturnToPath,
  safeTokenCompare,
} from "@/lib/googleOAuth";

function loginRedirectUrl(request, errorCode = "") {
  const url = new URL("/login", request.url);
  if (errorCode) {
    url.searchParams.set("error", errorCode);
  }
  return url;
}

function clearOauthCookies(response) {
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", clearGoogleOAuthCookieOptions());
  response.cookies.set(GOOGLE_OAUTH_RETURN_TO_COOKIE, "", clearGoogleOAuthCookieOptions());
  return response;
}

function failAuth(request, errorCode = "google_auth_failed") {
  const response = NextResponse.redirect(loginRedirectUrl(request, errorCode), { status: 302 });
  return clearOauthCookies(response);
}

function mapGoogleCallbackErrorToCode(error) {
  const message = String(error?.message || "");
  if (message.includes("GOOGLE_TOKEN_EXCHANGE_FAILED")) return "google_token_exchange_failed";
  if (message.includes("GOOGLE_TOKEN_MISSING")) return "google_token_missing";
  if (message.includes("GOOGLE_USERINFO_FAILED")) return "google_userinfo_failed";
  if (message.includes("GOOGLE_EMAIL_NOT_VERIFIED")) return "google_email_not_verified";
  if (message.includes("GOOGLE_EMAIL_MISSING")) return "google_email_missing";
  return "google_auth_failed";
}

async function exchangeGoogleCodeForAccessToken({ code, clientId, clientSecret, redirectUri }) {
  const payload = new URLSearchParams({
    code: String(code || ""),
    client_id: String(clientId || ""),
    client_secret: String(clientSecret || ""),
    redirect_uri: String(redirectUri || ""),
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GOOGLE_TOKEN_EXCHANGE_FAILED:${response.status}:${String(body?.error || "")}`);
  }

  const accessToken = String(body?.access_token || "").trim();
  if (!accessToken) {
    throw new Error("GOOGLE_TOKEN_MISSING");
  }

  return accessToken;
}

async function fetchGoogleUserProfile(accessToken) {
  const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: {
      Authorization: `Bearer ${String(accessToken || "")}`,
    },
    cache: "no-store",
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`GOOGLE_USERINFO_FAILED:${response.status}`);
  }

  const email = String(body?.email || "").trim().toLowerCase();
  const name = String(body?.name || "").trim();
  const sub = String(body?.sub || "").trim();
  const picture = String(body?.picture || "").trim();
  const emailVerified = body?.email_verified === true || String(body?.email_verified || "") === "true";

  if (!email) {
    throw new Error("GOOGLE_EMAIL_MISSING");
  }
  if (!emailVerified) {
    throw new Error("GOOGLE_EMAIL_NOT_VERIFIED");
  }

  return { email, name, sub, picture };
}

export async function GET(request) {
  const ctx = createRequestContext(request, "auth.google.callback");
  const ip = getClientIp(request);
  const enforceRateLimit = process.env.NODE_ENV === "production";
  try {
    if (enforceRateLimit) {
      const rateLimitResult = consumeRateLimit({
        key: `auth:google:callback:ip:${ip}`,
        limit: 50,
        windowMs: 15 * 60 * 1000,
        blockDurationMs: 15 * 60 * 1000,
      });
      if (!rateLimitResult.allowed) {
        logWarn("auth.google.callback_rate_limited", { requestId: ctx.requestId, ip });
        return failAuth(request, "google_rate_limited");
      }
    }

    const googleError = String(request.nextUrl.searchParams.get("error") || "").trim();
    if (googleError) {
      logWarn("auth.google.callback_provider_error", {
        requestId: ctx.requestId,
        ip,
        providerError: googleError,
      });
      return failAuth(request, "google_access_denied");
    }

    const code = String(request.nextUrl.searchParams.get("code") || "").trim();
    const state = String(request.nextUrl.searchParams.get("state") || "").trim();
    if (!code || !state) {
      return failAuth(request, "google_invalid_callback");
    }

    const storedState = String(request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value || "").trim();
    if (!storedState || !safeTokenCompare(state, storedState)) {
      logWarn("auth.google.callback_state_mismatch", { requestId: ctx.requestId, ip });
      return failAuth(request, "google_state_mismatch");
    }

    const encodedReturnTo = String(request.cookies.get(GOOGLE_OAUTH_RETURN_TO_COOKIE)?.value || "").trim();
    let returnTo = "/dashboard";
    if (encodedReturnTo) {
      try {
        returnTo = normalizeReturnToPath(decodeURIComponent(encodedReturnTo), "/dashboard");
      } catch {
        returnTo = "/dashboard";
      }
    }

    const config = getGoogleOAuthConfig(request.url);
    if (!config.ready) {
      return failAuth(request, "google_not_configured");
    }

    const accessToken = await exchangeGoogleCodeForAccessToken({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
    const profile = await fetchGoogleUserProfile(accessToken);
    const user = await upsertGoogleUser({
      email: profile.email,
      name: profile.name,
      googleSub: profile.sub,
      avatarUrl: profile.picture,
    });

    const sessionToken = createSessionToken(user);
    const response = NextResponse.redirect(new URL(returnTo, request.url), { status: 302 });
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
    clearOauthCookies(response);

    logInfo("auth.google.callback_success", {
      requestId: ctx.requestId,
      ip,
      userId: Number(user?.id || 0) || null,
      returnTo,
    });
    return response;
  } catch (error) {
    const errorId = newErrorId();
    const details = errorDetails(error, "Google OAuth callback failed");
    const errorCode = mapGoogleCallbackErrorToCode(error);
    logError("auth.google.callback_failed", {
      requestId: ctx.requestId,
      ip,
      errorId,
      message: details.message,
      stack: details.stack,
      errorCode,
    });
    return failAuth(request, errorCode);
  }
}
