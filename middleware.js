import { NextResponse } from "next/server";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";

function resolvePolicy(pathname) {
  if (pathname.startsWith("/api/auth/login")) {
    return { key: "auth-login", limit: 12, windowMs: 15 * 60_000, blockDurationMs: 15 * 60_000 };
  }
  if (pathname.startsWith("/api/auth/register")) {
    return { key: "auth-register", limit: 6, windowMs: 60 * 60_000, blockDurationMs: 30 * 60_000 };
  }
  if (pathname.startsWith("/api/auth/forgot-password")) {
    return { key: "auth-forgot", limit: 8, windowMs: 60 * 60_000, blockDurationMs: 30 * 60_000 };
  }
  if (pathname.startsWith("/api/ai/plan")) {
    return { key: "ai-plan", limit: 24, windowMs: 10 * 60_000, blockDurationMs: 10 * 60_000 };
  }
  if (pathname.startsWith("/api/ocr/")) {
    return { key: "ocr", limit: 20, windowMs: 10 * 60_000, blockDurationMs: 10 * 60_000 };
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

export function middleware(request) {
  const pathname = String(request.nextUrl.pathname || "");
  const ip = getClientIp(request);

  if (process.env.NODE_ENV === "production" && !isSecureRequest(request)) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "warn",
        event: "security.https_required_blocked",
        path: pathname,
        ip,
      })
    );
    return NextResponse.json({ error: "HTTPS is required" }, { status: 426 });
  }

  const policy = resolvePolicy(pathname);
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
        },
      }
    );
  }

  return NextResponse.next({
    headers: {
      "X-RateLimit-Remaining": String(result.remaining),
    },
  });
}

export const config = {
  matcher: ["/api/:path*"],
};
