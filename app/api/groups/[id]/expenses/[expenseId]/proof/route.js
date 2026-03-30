import { NextResponse } from "next/server";
import { readDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup } from "@/lib/access";
import { readStoredProof } from "@/lib/proofStorage";
import { parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const proofParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group/expense id"),
  expenseId: z.coerce.number().int().positive("Invalid group/expense id"),
});

async function resolveParams(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, proofParamsSchema);
  return {
    groupId: Number(params.id),
    expenseId: Number(params.expenseId),
  };
}

function fallbackContentType(value) {
  const mime = String(value || "").trim();
  return mime || "application/octet-stream";
}

export async function GET(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, expenseId } = await resolveParams(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(expenseId)) {
      return NextResponse.json({ error: "Invalid group/expense id" }, { status: 400 });
    }

    const db = await readDB();
    if (!canAccessGroup(db, groupId, session)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const expense = (db.expenses || []).find(
      (item) => Number(item.groupId) === groupId && Number(item.id) === expenseId
    );
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const proofPath = String(expense.proofPath || "").trim();
    const proofName = String(expense.proofName || `expense-proof-${expenseId}`).trim();
    const proofMimeType = fallbackContentType(expense.proofMimeType);

    if (!proofPath) {
      return NextResponse.json({ error: "No proof attached" }, { status: 404 });
    }

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
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load expense proof" }, { status: 500 });
  }
}
