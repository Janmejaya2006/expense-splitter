import crypto from "node:crypto";

function toJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ fallback: String(value) });
  }
}

function emit(level, event, details = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...details,
  };

  const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
  // Structured logs keep local debugging and cloud log filters consistent.
  console[method](toJson(payload));
}

export function newErrorId() {
  return crypto.randomBytes(8).toString("hex");
}

export function createRequestContext(request, route, extra = {}) {
  const requestId = String(request.headers.get("x-request-id") || "").trim() || crypto.randomUUID();
  return {
    requestId,
    route,
    method: String(request.method || "GET").toUpperCase(),
    path: request.nextUrl?.pathname || "",
    ...extra,
  };
}

export function logInfo(event, details) {
  emit("info", event, details);
}

export function logWarn(event, details) {
  emit("warn", event, details);
}

export function logError(event, details) {
  emit("error", event, details);
}

export function errorDetails(error, fallback = "Internal server error") {
  const message = error instanceof Error ? error.message || fallback : fallback;
  const stack = error instanceof Error ? error.stack || "" : "";
  return {
    message,
    stack,
  };
}
