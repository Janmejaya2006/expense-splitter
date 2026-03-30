import { NextResponse } from "next/server";
import { buildPlanFromPrompt } from "@/lib/aiPlanner";
import { requireAuth } from "@/lib/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { createRequestContext, errorDetails, logError, logWarn, newErrorId } from "@/lib/logger";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const aiPlanSchema = z.object({
  prompt: z.string().trim().min(1, "Prompt is required").max(4000, "Prompt is too long"),
});

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;
  const ctx = createRequestContext(request, "ai.plan", {
    userId: Number(session.userId || 0),
  });

  try {
    const payload = await parseRequestBody(request, aiPlanSchema, {
      invalidJsonMessage: "Invalid AI plan payload",
    });
    const prompt = payload.prompt;
    const ip = getClientIp(request);

    const limitResult = consumeRateLimit({
      key: `ai:plan:user:${Number(session.userId || 0) || ip}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
      blockDurationMs: 10 * 60 * 1000,
    });
    if (!limitResult.allowed) {
      const seconds = Math.max(1, Math.ceil(Number(limitResult.retryAfterMs || 0) / 1000));
      logWarn("ai.plan_rate_limited", {
        requestId: ctx.requestId,
        userId: Number(session.userId || 0) || null,
        ip,
      });
      return NextResponse.json(
        { error: "Rate limit reached for AI plan generation. Please try again shortly." },
        { status: 429, headers: { "Retry-After": String(seconds) } }
      );
    }

    const plan = await buildPlanFromPrompt(prompt);
    return NextResponse.json({ plan });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to build AI plan");
    logError("ai.plan_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message || "Failed to build AI plan", errorId }, { status: 500 });
  }
}
