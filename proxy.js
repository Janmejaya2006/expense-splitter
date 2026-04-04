import { NextResponse } from "next/server";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";

function resolvePolicy(pathname, method) {
  if (pathname.startsWith("/api/auth/login")) {
    if (method === "GET") {
      // Session polling uses this endpoint, so it needs a much higher budget than interactive login attempts.
      return { key: "auth-session", limit: 240, windowMs: 60_000, blockDurationMs: 60_000 };
    }
    return { key: "auth-login", limit: 12, windowMs: 15 * 60_000, blockDurationMs: 15 * 60_000 };
  }
  if (pathname.startsWith("/api/auth/register")) {
    return { key: "auth-register", limit: 6, windowMs: 60 * 60_000, blockDurationMs: 30 * 60_000 };
  }
  if (pathname.startsWith("/api/auth/forgot-password")) {
    return { key: "auth-forgot", limit: 8, windowMs: 60 * 60_000, blockDurationMs: 30 * 60_000 };
  }
  if (pathname.startsWith("/api/auth/session")) {
    return { key: "auth-session", limit: 300, windowMs: 60_000, blockDurationMs: 60_000 };
  }
  if (pathname.startsWith("/api/auth/google/start")) {
    return { key: "auth-google-start", limit: 40, windowMs: 15 * 60_000, blockDurationMs: 15 * 60_000 };
  }
  if (pathname.startsWith("/api/auth/google/callback")) {
    return { key: "auth-google-callback", limit: 80, windowMs: 15 * 60_000, blockDurationMs: 15 * 60_000 };
  }
  if (pathname.startsWith("/api/ai/plan")) {
    return { key: "ai-plan", limit: 24, windowMs: 10 * 60_000, blockDurationMs: 10 * 60_000 };
  }
  if (pathname.startsWith("/api/search")) {
    return { key: "search", limit: 120, windowMs: 60_000, blockDurationMs: 60_000 };
  }
  if (pathname.startsWith("/api/expenses/filters")) {
    if (method === "GET") {
      return { key: "expenses-filters-read", limit: 160, windowMs: 60_000, blockDurationMs: 60_000 };
    }
    return { key: "expenses-filters-write", limit: 45, windowMs: 15 * 60_000, blockDurationMs: 5 * 60_000 };
  }
  if (/^\/api\/groups\/[^/]+\/expenses/.test(pathname)) {
    if (method === "GET") {
      return { key: "group-expenses-read", limit: 200, windowMs: 60_000, blockDurationMs: 60_000 };
    }
    return { key: "group-expenses-write", limit: 90, windowMs: 15 * 60_000, blockDurationMs: 10 * 60_000 };
  }
  if (/^\/api\/groups\/[^/]+\/settlements\/notify/.test(pathname) || pathname.startsWith("/api/notifications")) {
    return { key: "settlement-notify", limit: 45, windowMs: 15 * 60_000, blockDurationMs: 15 * 60_000 };
  }
  if (pathname.startsWith("/api/groups")) {
    if (method === "GET") {
      return { key: "groups-read", limit: 180, windowMs: 60_000, blockDurationMs: 60_000 };
    }
    return { key: "groups-write", limit: 70, windowMs: 15 * 60_000, blockDurationMs: 10 * 60_000 };
  }
  if (pathname.startsWith("/api/payments/methods")) {
    if (method === "GET") {
      return { key: "payments-methods-read", limit: 220, windowMs: 60_000, blockDurationMs: 60_000 };
    }
    return { key: "payments-methods-write", limit: 40, windowMs: 15 * 60_000, blockDurationMs: 5 * 60_000 };
  }
  if (pathname.startsWith("/api/payments/checkout")) {
    return { key: "payments-checkout", limit: 55, windowMs: 15 * 60_000, blockDurationMs: 5 * 60_000 };
  }
  if (pathname.startsWith("/api/payments/verify")) {
    return { key: "payments-verify", limit: 85, windowMs: 15 * 60_000, blockDurationMs: 5 * 60_000 };
  }
  if (pathname.startsWith("/api/ocr/")) {
    return { key: "ocr", limit: 20, windowMs: 10 * 60_000, blockDurationMs: 10 * 60_000 };
  }
  if (pathname.startsWith("/api/jobs/maintenance")) {
    return { key: "maintenance-job", limit: 10, windowMs: 60 * 60_000, blockDurationMs: 30 * 60_000 };
  }
  return { key: "api-default", limit: 180, windowMs: 60_000, blockDurationMs: 60_000 };
}

function isSecureRequest(request) {
  const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").toLowerCase();
  if (forwardedProto) {
    return forwardedProto.split(",").some((part) => part.trim() === "https");
  }
  return request.nextUrl.protocol === "https:";
}

function isLocalHostname(hostname) {
  const value = String(hostname || "").trim().toLowerCase();
  return value === "localhost" || value === "127.0.0.1" || value === "::1";
}

function isSuspiciousUserAgent(userAgent) {
  const ua = String(userAgent || "").trim().toLowerCase();
  if (!ua) return true;
  return ["curl", "wget", "python-requests", "httpie", "postmanruntime"].some((token) => ua.includes(token));
}

export function proxy(request) {
  const pathname = String(request.nextUrl.pathname || "");
  const method = String(request.method || "GET").toUpperCase();
  const ip = getClientIp(request);
  const generatedRequestId =
    typeof globalThis?.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const requestId = String(request.headers.get("x-request-id") || "").trim() || generatedRequestId;
  const enforceRateLimit = process.env.NODE_ENV === "production";

  const allowInsecureLocal =
    String(process.env.ALLOW_INSECURE_LOCALHOST || "1").trim().toLowerCase() !== "0" &&
    isLocalHostname(request.nextUrl.hostname);

  if (process.env.NODE_ENV === "production" && !allowInsecureLocal && !isSecureRequest(request)) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        event: "security.https_required_blocked",
        path: pathname,
        ip,
        requestId,
      })
    );
    return NextResponse.json({ error: "HTTPS is required" }, { status: 426 });
  }

  if (process.env.NODE_ENV === "production" && isSuspiciousUserAgent(request.headers.get("user-agent"))) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        event: "security.suspicious_user_agent",
        path: pathname,
        method,
        ip,
        requestId,
      })
    );
  }

  if (!enforceRateLimit) {
    const response = NextResponse.next();
    response.headers.set("X-Request-Id", requestId);
    return response;
  }

  const policy = resolvePolicy(pathname, method);
  const result = consumeRateLimit({
    key: `${policy.key}:${ip}`,
    limit: policy.limit,
    windowMs: policy.windowMs,
    blockDurationMs: policy.blockDurationMs,
  });

  if (!result.allowed) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        event: "security.rate_limit_blocked",
        path: pathname,
        ip,
        requestId,
        policy: policy.key,
        retryAfterMs: Number(result.retryAfterMs || 0),
      })
    );
    const seconds = Math.max(1, Math.ceil(Number(result.retryAfterMs || 0) / 1000));
    return NextResponse.json(
      {
        error: "Too many requests. Please try again later.",
        retryAfterSeconds: seconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(seconds),
          "X-Request-Id": requestId,
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Policy", String(policy.key));
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
