import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { readDB, updateDB } from "@/lib/store";
import { parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const filterParamsSchema = z.object({
  filterId: z
    .string()
    .trim()
    .min(1, "Filter id is required")
    .max(64, "Filter id is invalid")
    .regex(/^[A-Za-z0-9._:-]+$/, "Filter id is invalid"),
});

function normalizeFilter(filter) {
  const raw = filter && typeof filter === "object" ? filter : {};
  const criteria = raw.criteria && typeof raw.criteria === "object" ? raw.criteria : {};
  const memberId = Number(criteria.memberId || 0);
  const minAmount = Number(criteria.minAmount);
  const maxAmount = Number(criteria.maxAmount);
  return {
    id: String(raw.id || ""),
    name: String(raw.name || "").trim(),
    criteria: {
      search: String(criteria.search || "").trim(),
      category: String(criteria.category || "").trim(),
      memberId: Number.isFinite(memberId) && memberId > 0 ? memberId : null,
      dateFrom: String(criteria.dateFrom || "").trim(),
      dateTo: String(criteria.dateTo || "").trim(),
      minAmount: Number.isFinite(minAmount) && minAmount >= 0 ? minAmount : null,
      maxAmount: Number.isFinite(maxAmount) && maxAmount >= 0 ? maxAmount : null,
    },
    createdAt: String(raw.createdAt || ""),
    updatedAt: String(raw.updatedAt || raw.createdAt || ""),
  };
}

async function resolveFilterId(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, filterParamsSchema);
  return String(params.filterId || "").trim();
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const filterId = await resolveFilterId(params);
    await updateDB((draft) => {
      const user = (draft.users || []).find((item) => Number(item.id) === Number(session.userId));
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }
      user.savedExpenseFilters = Array.isArray(user.savedExpenseFilters) ? user.savedExpenseFilters : [];
      const before = user.savedExpenseFilters.length;
      user.savedExpenseFilters = user.savedExpenseFilters.filter((item) => String(item.id || "") !== filterId);
      if (before === user.savedExpenseFilters.length) {
        throw new Error("NOT_FOUND");
      }
      return draft;
    });

    const db = await readDB();
    const user = (db.users || []).find((item) => Number(item.id) === Number(session.userId));
    const filters = Array.isArray(user?.savedExpenseFilters) ? user.savedExpenseFilters.map(normalizeFilter) : [];

    return NextResponse.json({ success: true, filters });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Saved filter not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete saved filter" }, { status: 500 });
  }
}
