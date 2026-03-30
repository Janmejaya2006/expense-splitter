import { NextResponse } from "next/server";
import { appendActivity, groupBundle, nowISO, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { storePaymentProof } from "@/lib/proofStorage";
import { createRequestContext, errorDetails, logError, logInfo, newErrorId } from "@/lib/logger";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const groupParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group id"),
});

const settlementPaymentSchema = z
  .object({
    fromMemberId: z.coerce.number().int().positive("Member mapping is required"),
    toMemberId: z.coerce.number().int().positive("Member mapping is required"),
    amount: z.coerce.number().finite().positive("Settlement amount must be positive"),
    note: z.string().trim().max(1000, "Settlement note is too long").optional().default(""),
    proof: z
      .object({
        name: z.string().trim().max(180, "Proof file name is too long").optional().default(""),
        type: z.string().trim().max(120, "Proof file type is too long").optional().default(""),
        base64: z.string().trim().optional().default(""),
      })
      .optional()
      .nullable(),
  })
  .refine((payload) => payload.fromMemberId !== payload.toMemberId, "Settlement requires two different members");

async function resolveGroupId(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, groupParamsSchema);
  return Number(params.id);
}

export async function GET(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const groupId = await resolveGroupId(params);

    const db = await readDB();
    if (!hasGroupPermission(db, groupId, session, "markSettlementPaid")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = groupBundle(db, groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const payments = (group.settlementPayments || []).map((payment) => {
      const safe = { ...payment };
      if (safe.proofBase64) {
        delete safe.proofBase64;
      }
      safe.proofUrl = safe.proofPath
        ? `/api/groups/${groupId}/settlements/payments/${safe.id}/proof`
        : null;
      return safe;
    });

    return NextResponse.json({ payments });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load settlement payments" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;
  const ctx = createRequestContext(request, "groups.settlements.payments.create", {
    userId: Number(session.userId || 0),
  });

  try {
    const groupId = await resolveGroupId(params);
    const payload = await parseRequestBody(request, settlementPaymentSchema, {
      invalidJsonMessage: "Invalid settlement payload",
    });
    const fromMemberId = Number(payload.fromMemberId);
    const toMemberId = Number(payload.toMemberId);
    const amount = Number(payload.amount || 0);
    const note = String(payload.note || "");
    const proof = payload.proof && typeof payload.proof === "object" ? payload.proof : null;
    const proofName = String(proof?.name || "");
    const proofMimeType = String(proof?.type || "");
    const proofBase64 = String(proof?.base64 || "");

    if (proofBase64 && Buffer.byteLength(proofBase64, "base64") > 1_500_000) {
      return NextResponse.json({ error: "Proof file is too large" }, { status: 400 });
    }

    const db = await readDB();
    if (!hasGroupPermission(db, groupId, session, "markSettlementPaid")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = groupBundle(db, groupId);

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const payer = group.members.find((member) => Number(member.id) === fromMemberId);
    const payee = group.members.find((member) => Number(member.id) === toMemberId);

    if (!payer || !payee) {
      return NextResponse.json({ error: "Could not resolve settlement members" }, { status: 400 });
    }

    const pending = (group.summary?.settlements || []).find(
      (item) => Number(item.fromMemberId) === fromMemberId && Number(item.toMemberId) === toMemberId
    );

    if (!pending) {
      return NextResponse.json(
        { error: "No pending settlement exists for this member pair." },
        { status: 400 }
      );
    }

    if (amount - Number(pending.amount) > 0.01) {
      return NextResponse.json(
        { error: `Amount exceeds pending settlement (${group.currency} ${pending.amount}).` },
        { status: 400 }
      );
    }

    let storedProof = null;
    if (proofBase64) {
      storedProof = await storePaymentProof({
        groupId,
        fileName: proofName,
        mimeType: proofMimeType,
        base64: proofBase64,
      });
    }

    const savedDb = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "markSettlementPaid")) {
        throw new Error("FORBIDDEN");
      }

      const id = Number(draft.meta.nextSettlementPaymentId);
      draft.meta.nextSettlementPaymentId += 1;

      draft.settlementPayments.push({
        id,
        groupId,
        fromMemberId,
        fromName: payer.name,
        toMemberId,
        toName: payee.name,
        amount,
        currency: group.currency,
        note,
        proofName: storedProof?.proofName || proofName,
        proofMimeType: storedProof?.proofMimeType || proofMimeType,
        proofPath: storedProof?.proofPath || "",
        proofBytes: Number(storedProof?.proofBytes || 0),
        proofHash: storedProof?.proofHash || "",
        proofStorage: storedProof?.storage || null,
        status: "completed",
        createdByUserId: Number(session.userId || 0) || null,
        createdAt: nowISO(),
      });

      appendActivity(draft, {
        groupId,
        type: "settlement_paid",
        message: `${payer.name} marked payment to ${payee.name} for ${group.currency} ${Number(amount).toFixed(2)}.`,
        createdByUserId: Number(session.userId || 0) || null,
        relatedPaymentId: id,
      });

      return draft;
    });

    const updatedGroup = groupBundle(savedDb, groupId);
    if (!updatedGroup) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const payment = updatedGroup.settlementPayments?.[0] || null;
    if (payment?.proofPath) {
      payment.proofUrl = `/api/groups/${groupId}/settlements/payments/${payment.id}/proof`;
    }

    logInfo("settlement.payment_saved", {
      requestId: ctx.requestId,
      groupId,
      fromMemberId,
      toMemberId,
      amount,
      hasProof: Boolean(storedProof),
    });

    return NextResponse.json({
      success: true,
      payment,
      summary: updatedGroup.summary,
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "UNSUPPORTED_PROOF_TYPE") {
      return NextResponse.json(
        { error: "Proof must be PNG, JPEG, WEBP, or PDF." },
        { status: 400 }
      );
    }
    if (error.message === "INVALID_PROOF_CONTENT") {
      return NextResponse.json(
        { error: "Proof content does not match the provided file type." },
        { status: 400 }
      );
    }
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to save settlement payment");
    logError("settlement.payment_save_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
