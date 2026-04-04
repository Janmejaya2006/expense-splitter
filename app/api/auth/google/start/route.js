import { NextResponse } from "next/server";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { createRequestContext, logInfo, logWarn } from "@/lib/logger";
import {
  buildGoogleAuthorizeUrl,
  createGoogleOauthState,
  getGoogleOAuthConfig,
  googleOAuthCookieOptions,
  GOOGLE_OAUTH_RETURN_TO_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  normalizeReturnToPath,
} from "@/lib/googleOAuth";

function loginRedirectUrl(request, errorCode = "") {
  const url = new URL("/login", request.url);
  if (errorCode) {
    url.searchParams.set("error", errorCode);
  }
  return url;
}

function redirectWithError(request, errorCode) {
  return NextResponse.redirect(loginRedirectUrl(request, errorCode), { status: 302 });
}

export async function GET(request) {
  const ctx = createRequestContext(request, "auth.google.start");
  const ip = getClientIp(request);
  const enforceRateLimit = process.env.NODE_ENV === "production";
  try {
    if (enforceRateLimit) {
      const limitResult = consumeRateLimit({
        key: `auth:google:start:ip:${ip}`,
        limit: 30,
        windowMs: 15 * 60 * 1000,
        blockDurationMs: 15 * 60 * 1000,
      });
      if (!limitResult.allowed) {
        logWarn("auth.google.start_rate_limited", {
          requestId: ctx.requestId,
          ip,
        });
        return redirectWithError(request, "google_rate_limited");
      }
    }

    const config = getGoogleOAuthConfig(request.url);
    if (!config.ready) {
      logWarn("auth.google.start_not_configured", {
        requestId: ctx.requestId,
        ip,
      });
      return redirectWithError(request, "google_not_configured");
    }

    const returnTo = normalizeReturnToPath(request.nextUrl.searchParams.get("returnTo"), "/dashboard");
    const state = createGoogleOauthState();
    const authorizeUrl = buildGoogleAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      state,
    });

    const response = NextResponse.redirect(authorizeUrl, { status: 302 });
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, googleOAuthCookieOptions());
    response.cookies.set(
      GOOGLE_OAUTH_RETURN_TO_COOKIE,
      encodeURIComponent(returnTo),
      googleOAuthCookieOptions()
    );

    logInfo("auth.google.start_redirected", {
      requestId: ctx.requestId,
      ip,
      returnTo,
    });
    return response;
  } catch (error) {
    logWarn("auth.google.start_failed", {
      requestId: ctx.requestId,
      ip,
      message: error instanceof Error ? error.message : "Failed to start Google auth",
    });
    return redirectWithError(request, "google_start_failed");
  }
}
