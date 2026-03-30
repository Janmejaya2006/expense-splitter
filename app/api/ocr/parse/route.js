import { NextResponse } from "next/server";
import { parseReceiptText } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const parseOcrTextSchema = z.object({
  text: z.string().trim().min(1, "Receipt text is required").max(50_000, "Receipt text is too long"),
});

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit({
      key: `ocr:parse:${Number(session.userId || 0) || ip}`,
      limit: 25,
      windowMs: 10 * 60 * 1000,
      blockDurationMs: 10 * 60 * 1000,
    });
    if (!limit.allowed) {
      const seconds = Math.max(1, Math.ceil(Number(limit.retryAfterMs || 0) / 1000));
      return NextResponse.json(
        { error: "Too many OCR parse requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(seconds) } }
      );
    }

    const body = await parseRequestBody(request, parseOcrTextSchema, {
      invalidJsonMessage: "Invalid OCR payload",
    });
    const text = body.text;

    const parsed = parseReceiptText(text);
    return NextResponse.json({ parsed });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to parse receipt" }, { status: 500 });
  }
}
