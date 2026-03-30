import { NextResponse } from "next/server";
import { readDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup } from "@/lib/access";
import { readStoredProof } from "@/lib/proofStorage";
import { createRequestContext, errorDetails, logError, newErrorId } from "@/lib/logger";
import { parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const paymentProofParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group/payment id"),
  paymentId: z.coerce.number().int().positive("Invalid group/payment id"),
});

async function resolveParams(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, paymentProofParamsSchema);
  return {
    groupId: Number(params.id),
    paymentId: Number(params.paymentId),
  };
}

function fallbackContentType(value) {
  const mime = String(value || "").trim();
  return mime || "application/octet-stream";
}

export async function GET(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;
  const ctx = createRequestContext(request, "groups.settlements.payments.proof", {
    userId: Number(session.userId || 0),
  });

  try {
    const { groupId, paymentId } = await resolveParams(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(paymentId)) {
      return NextResponse.json({ error: "Invalid group/payment id" }, { status: 400 });
    }

    const db = await readDB();
    if (!canAccessGroup(db, groupId, session)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const payment = (db.settlementPayments || []).find(
      (item) => Number(item.groupId) === groupId && Number(item.id) === paymentId
    );
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const proofPath = String(payment.proofPath || "").trim();
    const proofName = String(payment.proofName || `payment-proof-${paymentId}`).trim();
    const proofMimeType = fallbackContentType(payment.proofMimeType);

    if (proofPath) {
      const file = await readStoredProof(proofPath);
      if (!file) {
        return NextResponse.json({ error: "Proof file not found" }, { status: 404 });
      }

      return new NextResponse(file.buffer, {
        status: 200,
        headers: {
          "Content-Type": proofMimeType,
          "Content-Disposition": `inline; filename="${proofName}"`,
          "Cache-Control": "private, max-age=60",
        },
      });
    }

    const legacyBase64 = String(payment.proofBase64 || "").trim();
    if (!legacyBase64) {
      return NextResponse.json({ error: "No proof attached" }, { status: 404 });
    }

    const legacyBuffer = Buffer.from(legacyBase64, "base64");
    return new NextResponse(legacyBuffer, {
      status: 200,
      headers: {
        "Content-Type": proofMimeType,
        "Content-Disposition": `inline; filename="${proofName}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to load proof file");
    logError("settlement.payment_proof_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
