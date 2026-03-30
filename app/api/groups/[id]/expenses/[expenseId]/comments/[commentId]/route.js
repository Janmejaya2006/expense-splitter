import { NextResponse } from "next/server";
import { appendActivity, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { canAccessGroup, hasGroupPermission } from "@/lib/access";
import { parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

async function resolveIds(paramsPromise) {
  const params = await parseRouteParams(
    paramsPromise,
    z.object({
      id: z.coerce.number().int().positive("Invalid group/expense/comment id"),
      expenseId: z.coerce.number().int().positive("Invalid group/expense/comment id"),
      commentId: z.coerce.number().int().positive("Invalid group/expense/comment id"),
    })
  );
  return {
    groupId: Number(params.id),
    expenseId: Number(params.expenseId),
    commentId: Number(params.commentId),
  };
}

export async function DELETE(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { groupId, expenseId, commentId } = await resolveIds(params);
    if (!Number.isFinite(groupId) || !Number.isFinite(expenseId) || !Number.isFinite(commentId)) {
      return NextResponse.json({ error: "Invalid group/expense/comment id" }, { status: 400 });
    }

    const db = await readDB();
    if (!canAccessGroup(db, groupId, session)) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const comment = (db.expenseComments || []).find(
      (item) =>
        Number(item.groupId) === groupId &&
        Number(item.expenseId) === expenseId &&
        Number(item.id) === commentId
    );
    if (!comment) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const isAuthor = Number(comment.createdByUserId || 0) === Number(session.userId || 0);
    const canEditExpenses = hasGroupPermission(db, groupId, session, "editExpense");
    if (!isAuthor && !canEditExpenses) {
      return NextResponse.json({ error: "Not allowed to delete this comment" }, { status: 403 });
    }

    const saved = await updateDB((draft) => {
      if (!canAccessGroup(draft, groupId, session)) {
        throw new Error("FORBIDDEN");
      }

      const liveComment = (draft.expenseComments || []).find(
        (item) =>
          Number(item.groupId) === groupId &&
          Number(item.expenseId) === expenseId &&
          Number(item.id) === commentId
      );
      if (!liveComment) {
        throw new Error("NOT_FOUND");
      }

      const isLiveAuthor = Number(liveComment.createdByUserId || 0) === Number(session.userId || 0);
      const canLiveEditExpenses = hasGroupPermission(draft, groupId, session, "editExpense");
      if (!isLiveAuthor && !canLiveEditExpenses) {
        throw new Error("FORBIDDEN");
      }

      draft.expenseComments = (draft.expenseComments || []).filter(
        (item) => Number(item.id) !== commentId
      );
      appendActivity(draft, {
        groupId,
        type: "expense_comment_deleted",
        message: "An expense comment was deleted.",
        createdByUserId: Number(session.userId || 0) || null,
        relatedExpenseId: expenseId,
        relatedCommentId: commentId,
      });
      return draft;
    });

    const comments = (saved.expenseComments || [])
      .filter((item) => Number(item.groupId) === groupId && Number(item.expenseId) === expenseId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return NextResponse.json({ comments });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    if (error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Not allowed to delete this comment" }, { status: 403 });
    }
    if (error.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
