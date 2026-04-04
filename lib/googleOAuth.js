import crypto from "node:crypto";

export const GOOGLE_OAUTH_STATE_COOKIE = "expense_split_google_oauth_state";
export const GOOGLE_OAUTH_RETURN_TO_COOKIE = "expense_split_google_oauth_return_to";
export const GOOGLE_OAUTH_STATE_TTL_SECONDS = 60 * 10;

export function getGoogleOAuthConfig(requestUrl = "") {
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  const configuredRedirect = String(process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim();
  const fallbackOrigin = String(requestUrl ? new URL(requestUrl).origin : "").trim();
  const redirectUri = configuredRedirect || (fallbackOrigin ? `${fallbackOrigin}/api/auth/google/callback` : "");

  return {
    clientId,
    clientSecret,
    redirectUri,
    ready: Boolean(clientId && clientSecret && redirectUri),
  };
}

export function buildGoogleAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", String(clientId || ""));
  url.searchParams.set("redirect_uri", String(redirectUri || ""));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", String(state || ""));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function createGoogleOauthState() {
  return crypto.randomBytes(32).toString("base64url");
}

export function normalizeReturnToPath(value, fallback = "/dashboard") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (raw.startsWith("/api/")) return fallback;
  if (raw.startsWith("/_next/")) return fallback;
  return raw;
}

export function googleOAuthCookieOptions(maxAgeSeconds = GOOGLE_OAUTH_STATE_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: Number(maxAgeSeconds || 0),
  };
}

export function clearGoogleOAuthCookieOptions() {
  return {
    ...googleOAuthCookieOptions(),
    maxAge: 0,
  };
}

export function safeTokenCompare(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (!a.length || !b.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
