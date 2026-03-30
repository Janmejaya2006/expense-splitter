const GLOBAL_KEY = "__expense_split_rate_limit_store_v1__";

function getStore() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = new Map();
  }
  return globalThis[GLOBAL_KEY];
}

function nowMs() {
  return Date.now();
}

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return Number(fallback);
  return Math.floor(parsed);
}

function cleanupExpiredEntries(store, now) {
  for (const [key, entry] of store.entries()) {
    const resetAt = Number(entry?.resetAt || 0);
    const blockedUntil = Number(entry?.blockedUntil || 0);
    if (resetAt < now && blockedUntil < now) {
      store.delete(key);
    }
  }
}

export function getClientIp(request) {
  const forwardedFor = String(request.headers.get("x-forwarded-for") || "").trim();
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0];
    if (first) return first.trim();
  }

  const realIp = String(request.headers.get("x-real-ip") || "").trim();
  if (realIp) return realIp;

  const cfIp = String(request.headers.get("cf-connecting-ip") || "").trim();
  if (cfIp) return cfIp;

  return "0.0.0.0";
}

export function consumeRateLimit({
  key,
  limit = 60,
  windowMs = 60_000,
  blockDurationMs = 0,
} = {}) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    return { allowed: true, remaining: 0, retryAfterMs: 0, resetAt: nowMs() };
  }

  const safeLimit = toPositiveInt(limit, 60);
  const safeWindowMs = toPositiveInt(windowMs, 60_000);
  const safeBlockMs = Math.max(0, Number(blockDurationMs || 0));
  const now = nowMs();
  const store = getStore();

  if (store.size > 15_000) {
    cleanupExpiredEntries(store, now);
  }

  let entry = store.get(safeKey);
  if (!entry || Number(entry.resetAt || 0) <= now) {
    entry = {
      count: 0,
      resetAt: now + safeWindowMs,
      blockedUntil: 0,
    };
  }

  if (Number(entry.blockedUntil || 0) > now) {
    store.set(safeKey, entry);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, Number(entry.blockedUntil) - now),
      resetAt: Number(entry.resetAt || now + safeWindowMs),
    };
  }

  entry.count = Number(entry.count || 0) + 1;
  const overLimit = entry.count > safeLimit;

  if (overLimit) {
    if (safeBlockMs > 0) {
      entry.blockedUntil = now + safeBlockMs;
    }
    store.set(safeKey, entry);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: safeBlockMs > 0 ? safeBlockMs : Math.max(0, Number(entry.resetAt) - now),
      resetAt: Number(entry.resetAt || now + safeWindowMs),
    };
  }

  store.set(safeKey, entry);
  return {
    allowed: true,
    remaining: Math.max(0, safeLimit - entry.count),
    retryAfterMs: 0,
    resetAt: Number(entry.resetAt || now + safeWindowMs),
  };
}
