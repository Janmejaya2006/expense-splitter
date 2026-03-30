import { NextResponse } from "next/server";
import { groupBundle, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { deleteStoredProof } from "@/lib/proofStorage";
import { createRequestContext, errorDetails, logError, logInfo, newErrorId } from "@/lib/logger";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

async function resolveIds(paramsPromise) {
  const params = await parseRouteParams(
    paramsPromise,
    z.object({
      id: z.coerce.number().int().positive("Invalid group/payment id"),
      paymentId: z.coerce.number().int().positive("Invalid group/payment id"),
    })
  );
  return {
    groupId: Number(params.id),
    paymentId: Number(params.paymentId),
  };
}

const paymentPatchSchema = z.object({
  note: z.string().trim().max(1000, "Note is too long"),
});

export async function PATCH(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;
  const ctx = createRequestContext(request, "groups.settlements.payments.update", {
    userId: Number(session.userId || 0),
  });

  try {
    const { groupId, paymentId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(paymentId)) {
      return NextResponse.json({ error: "Invalid group/payment id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "markSettlementPaid")) {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }

    const body = await parseRequestBody(request, paymentPatchSchema, {
      invalidJsonMessage: "Invalid payment payload",
    });
    const note = String(body.note || "").trim();

    let updatedPayment = null;
    await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "markSettlementPaid")) {
        throw new Error("FORBIDDEN");
      }

      const payment = (draft.settlementPayments || []).find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === paymentId
      );
      if (!payment) {
        throw new Error("NOT_FOUND");
      }

      payment.note = note;
      updatedPayment = { ...payment };
      return draft;
    });

    logInfo("settlement.payment_updated", {
      requestId: ctx.requestId,
      groupId,
      paymentId,
    });

    return NextResponse.json({ payment: updatedPayment });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to update payment");
    logError("settlement.payment_update_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;
  const ctx = createRequestContext(request, "groups.settlements.payments.delete", {
    userId: Number(session.userId || 0),
  });

  try {
    const { groupId, paymentId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(paymentId)) {
      return NextResponse.json({ error: "Invalid group/payment id" }, { status: 400 });
    }

    const existingDb = await readDB();
    if (!hasGroupPermission(existingDb, groupId, session, "markSettlementPaid")) {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }

    let removedProofPath = "";
    const db = await updateDB((draft) => {
      if (!hasGroupPermission(draft, groupId, session, "markSettlementPaid")) {
        throw new Error("FORBIDDEN");
      }

      const payment = (draft.settlementPayments || []).find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === paymentId
      );
      if (!payment) {
        throw new Error("NOT_FOUND");
      }
      removedProofPath = String(payment.proofPath || "").trim();

      draft.settlementPayments = (draft.settlementPayments || []).filter(
        (item) => Number(item.id) !== paymentId
      );
      return draft;
    });

    if (removedProofPath) {
      await deleteStoredProof(removedProofPath);
    }

    const group = groupBundle(db, groupId);
    logInfo("settlement.payment_deleted", {
      requestId: ctx.requestId,
      groupId,
      paymentId,
    });
    return NextResponse.json({
      success: true,
      summary: group?.summary || null,
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to delete payment");
    logError("settlement.payment_delete_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
