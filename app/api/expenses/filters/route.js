import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { readDB, updateDB } from "@/lib/store";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const criteriaSchema = z
  .object({
    search: z.string().trim().max(200, "Search text is too long").optional().default(""),
    category: z.string().trim().max(80, "Category is too long").optional().default(""),
    memberId: z.coerce.number().int().positive("memberId must be a positive integer").optional().nullable(),
    dateFrom: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((value) => !value || Number.isFinite(new Date(value).getTime()), "dateFrom is invalid"),
    dateTo: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine((value) => !value || Number.isFinite(new Date(value).getTime()), "dateTo is invalid"),
    minAmount: z.coerce.number().min(0, "minAmount must be >= 0").optional().nullable(),
    maxAmount: z.coerce.number().min(0, "maxAmount must be >= 0").optional().nullable(),
  })
  .refine(
    (value) =>
      value.minAmount === null ||
      value.minAmount === undefined ||
      value.maxAmount === null ||
      value.maxAmount === undefined ||
      Number(value.minAmount) <= Number(value.maxAmount),
    {
      message: "minAmount cannot be greater than maxAmount",
      path: ["maxAmount"],
    }
  );

const saveFilterSchema = z.object({
  id: z
    .string()
    .trim()
    .max(64, "Filter id is invalid")
    .regex(/^[A-Za-z0-9._:-]+$/, "Filter id is invalid")
    .optional(),
  name: z.string().trim().min(1, "Filter name is required").max(80, "Filter name is too long"),
  criteria: criteriaSchema.optional().default({}),
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
      minAmount: Number.isFinite(minAmount) && minAmount >= 0 ? Number(minAmount) : null,
      maxAmount: Number.isFinite(maxAmount) && maxAmount >= 0 ? Number(maxAmount) : null,
    },
    createdAt: String(raw.createdAt || ""),
    updatedAt: String(raw.updatedAt || raw.createdAt || ""),
  };
}

function sortFilters(filters) {
  return [...filters].sort((a, b) => {
    const left = new Date(a.updatedAt || 0).getTime();
    const right = new Date(b.updatedAt || 0).getTime();
    return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
  });
}

function newFilterId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(12).toString("hex");
}

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await readDB();
    const user = (db.users || []).find((item) => Number(item.id) === Number(session.userId));
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const filters = sortFilters(Array.isArray(user.savedExpenseFilters) ? user.savedExpenseFilters : []).map(
      normalizeFilter
    );
    return NextResponse.json({ filters });
  } catch {
    return NextResponse.json({ error: "Failed to load saved filters" }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const payload = await parseRequestBody(request, saveFilterSchema, {
      invalidJsonMessage: "Invalid saved filter payload",
    });
    const now = new Date().toISOString();
    const requestedId = String(payload.id || "").trim();

    let saved = null;
    await updateDB((draft) => {
      const user = (draft.users || []).find((item) => Number(item.id) === Number(session.userId));
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }
      user.savedExpenseFilters = Array.isArray(user.savedExpenseFilters) ? user.savedExpenseFilters : [];

      const existingIndex = requestedId
        ? user.savedExpenseFilters.findIndex((item) => String(item.id || "") === requestedId)
        : -1;

      if (existingIndex === -1 && user.savedExpenseFilters.length >= 25) {
        throw new Error("FILTER_LIMIT_REACHED");
      }

      const record = {
        id: existingIndex >= 0 ? requestedId : newFilterId(),
        name: payload.name,
        criteria: payload.criteria || {},
        createdAt: existingIndex >= 0 ? String(user.savedExpenseFilters[existingIndex]?.createdAt || now) : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        user.savedExpenseFilters[existingIndex] = record;
      } else {
        user.savedExpenseFilters.push(record);
      }

      saved = normalizeFilter(record);
      return draft;
    });

    const db = await readDB();
    const user = (db.users || []).find((item) => Number(item.id) === Number(session.userId));
    const filters = sortFilters(Array.isArray(user?.savedExpenseFilters) ? user.savedExpenseFilters : []).map(
      normalizeFilter
    );
    return NextResponse.json({ success: true, filter: saved, filters });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (error.message === "FILTER_LIMIT_REACHED") {
      return NextResponse.json(
        { error: "You can save up to 25 filters. Delete one before adding a new filter." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Failed to save filter" }, { status: 500 });
  }
}
