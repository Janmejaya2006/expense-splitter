import { NextResponse } from "next/server";
import { createWorker } from "tesseract.js";
import { parseReceiptText } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_SIZE = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function matchesImageSignature(buffer, mimeType) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  if (mimeType === "image/png") {
    return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (mimeType === "image/webp") {
    return buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function toRatio(confidence) {
  const value = Number(confidence || 0);
  if (!Number.isFinite(value)) return 0;
  const normalized = Math.min(100, Math.max(0, value)) / 100;
  return Number(normalized.toFixed(2));
}

function blendConfidence(parsedConfidence, ocrConfidenceRatio) {
  const parsed = Number(parsedConfidence || 0);
  const ocr = Number(ocrConfidenceRatio || 0);

  const safeParsed = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
  const safeOcr = Number.isFinite(ocr) ? Math.min(1, Math.max(0, ocr)) : 0;

  const blended = safeParsed * 0.65 + safeOcr * 0.35;
  return Number(blended.toFixed(2));
}

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const ip = getClientIp(request);
    const limit = consumeRateLimit({
      key: `ocr:image:${Number(session.userId || 0) || ip}`,
      limit: 12,
      windowMs: 10 * 60 * 1000,
      blockDurationMs: 10 * 60 * 1000,
    });
    if (!limit.allowed) {
      const seconds = Math.max(1, Math.ceil(Number(limit.retryAfterMs || 0) / 1000));
      return NextResponse.json(
        { error: "Too many OCR image uploads. Please try again later." },
        { status: 429, headers: { "Retry-After": String(seconds) } }
      );
    }

    const contentType = String(request.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Use multipart/form-data with a file field." }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const fileMimeType = String(file.type || "").trim().toLowerCase() === "image/jpg"
      ? "image/jpeg"
      : String(file.type || "").trim().toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(fileMimeType)) {
      return NextResponse.json({ error: "Upload a valid image file" }, { status: 400 });
    }

    if (Number(file.size || 0) > MAX_UPLOAD_SIZE) {
      return NextResponse.json({ error: "Image is too large. Max file size is 8MB." }, { status: 400 });
    }

    const imageBuffer = Buffer.from(await file.arrayBuffer());
    if (!matchesImageSignature(imageBuffer, fileMimeType)) {
      return NextResponse.json({ error: "Uploaded file content does not match image type." }, { status: 400 });
    }
    const worker = await createWorker("eng");

    try {
      const result = await worker.recognize(imageBuffer);
      const rawText = String(result?.data?.text || "").trim();

      if (!rawText) {
        return NextResponse.json(
          { error: "No readable text found in image. Try a clearer receipt photo." },
          { status: 422 }
        );
      }

      const parsed = parseReceiptText(rawText);
      const ocrConfidence = toRatio(result?.data?.confidence);

      return NextResponse.json({
        parsed: {
          ...parsed,
          confidence: blendConfidence(parsed.confidence, ocrConfidence),
        },
        rawText,
        ocr: {
          engine: "tesseract.js",
          confidence: ocrConfidence,
          fileName: String(file.name || "receipt-image"),
        },
      });
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Failed to parse receipt image" },
      { status: 500 }
    );
  }
}
