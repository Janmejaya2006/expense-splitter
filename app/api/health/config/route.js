import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getConfigHealth } from "@/lib/configHealth";
import { createRequestContext, errorDetails, logError, logInfo, newErrorId } from "@/lib/logger";

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  const ctx = createRequestContext(request, "health.config", {
    userId: Number(session.userId || 0),
  });

  try {
    const health = getConfigHealth();
    logInfo("health.config_ok", {
      requestId: ctx.requestId,
      score: health.score,
      ok: health.ok,
    });
    return NextResponse.json(health);
  } catch (error) {
    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to evaluate config health");
    logError("health.config_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
