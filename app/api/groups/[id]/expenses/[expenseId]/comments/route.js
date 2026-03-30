import { NextResponse } from "next/server";
import { appendActivity, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup } from "@/lib/access";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

async function resolveIds(paramsPromise) {
  const params = await parseRouteParams(
    paramsPromise,
    z.object({
      id: z.coerce.number().int().positive("Invalid group/expense id"),
      expenseId: z.coerce.number().int().positive("Invalid group/expense id"),
    })
  );
  return {
    groupId: Number(params.id),
    expenseId: Number(params.expenseId),
  };
}

const commentCreateSchema = z.object({
  text: z.string().trim().min(1, "Comment cannot be empty").max(500, "Comment is too long"),
});

function authorNameFromSession(session) {
  const name = String(session?.name || "").trim();
  if (name) return name;
  const email = String(session?.email || "").trim();
  if (!email) return "Member";
  return email.split("@")[0] || "Member";
}

export async function GET(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, expenseId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(expenseId)) {
      return NextResponse.json({ error: "Invalid group/expense id" }, { status: 400 });
    }

    const db = await readDB();
    if (!canAccessGroup(db, groupId, session)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const expenseExists = (db.expenses || []).some(
      (item) => Number(item.groupId) === groupId && Number(item.id) === expenseId
    );
    if (!expenseExists) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const comments = (db.expenseComments || [])
      .filter((item) => Number(item.groupId) === groupId && Number(item.expenseId) === expenseId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return NextResponse.json({ comments });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, expenseId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(expenseId)) {
      return NextResponse.json({ error: "Invalid group/expense id" }, { status: 400 });
    }

    const body = await parseRequestBody(request, commentCreateSchema, {
      invalidJsonMessage: "Invalid comment payload",
    });
    const text = body.text;

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

    const authorName = authorNameFromSession(session);
    const saved = await updateDB((draft) => {
      if (!canAccessGroup(draft, groupId, session)) {
        throw new Error("FORBIDDEN");
      }
      const liveExpense = (draft.expenses || []).find(
        (item) => Number(item.groupId) === groupId && Number(item.id) === expenseId
      );
      if (!liveExpense) {
        throw new Error("NOT_FOUND");
      }

      const id = Number(draft.meta.nextExpenseCommentId);
      draft.meta.nextExpenseCommentId += 1;
      const createdAt = new Date().toISOString();

      draft.expenseComments.push({
        id,
        groupId,
        expenseId,
        text,
        authorName,
        createdByUserId: Number(session.userId || 0) || null,
        createdAt,
      });

      appendActivity(draft, {
        groupId,
        type: "expense_comment_added",
        message: `${authorName} commented on "${liveExpense.title}".`,
        createdByUserId: Number(session.userId || 0) || null,
        relatedExpenseId: expenseId,
        relatedCommentId: id,
      });

      return draft;
    });

    const comments = (saved.expenseComments || [])
      .filter((item) => Number(item.groupId) === groupId && Number(item.expenseId) === expenseId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return NextResponse.json({ comments }, { status: 201 });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
