import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { readDB } from "@/lib/store";
import { scopeDbForUser } from "@/lib/access";
import { parseWithSchema, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const searchSchema = z.object({
  q: z.string().trim().min(1, "Search query is required").max(120, "Search query is too long"),
  limit: z.coerce.number().int().min(1).max(20).optional().default(8),
  include: z.string().trim().optional().default("groups,expenses,activity"),
});

function toKey(value) {
  return String(value || "").trim().toLowerCase();
}

function tokenize(value) {
  return toKey(value)
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasAllTokens(text, tokens) {
  if (!tokens.length) return false;
  const source = toKey(text);
  return tokens.every((token) => source.includes(token));
}

function scoreText(text, tokens) {
  const source = toKey(text);
  let score = 0;
  for (const token of tokens) {
    if (source.startsWith(token)) score += 5;
    if (source.includes(token)) score += 3;
  }
  return score;
}

function recentSort(a, b) {
  const left = new Date(a.createdAt || 0).getTime();
  const right = new Date(b.createdAt || 0).getTime();
  return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
}

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const { searchParams } = new URL(request.url);
    const query = parseWithSchema(
      searchSchema,
      {
        q: searchParams.get("q") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
        include: searchParams.get("include") ?? undefined,
      },
      { message: "Invalid search query" }
    );

    const q = query.q;
    const limit = Number(query.limit || 8);
    const include = new Set(
      String(query.include || "groups,expenses,activity")
        .split(",")
        .map((item) => toKey(item))
        .filter(Boolean)
    );
    const tokens = tokenize(q);
    if (!tokens.length) {
      return NextResponse.json({ query: q, total: 0, groups: [], expenses: [], activity: [], items: [] });
    }

    const db = await readDB();
    const scoped = scopeDbForUser(db, session);
    const groups = Array.isArray(scoped.groups) ? scoped.groups : [];
    const members = Array.isArray(scoped.members) ? scoped.members : [];
    const expenses = Array.isArray(scoped.expenses) ? scoped.expenses : [];
    const activities = Array.isArray(scoped.activityLogs) ? scoped.activityLogs : [];

    const groupById = new Map(groups.map((group) => [Number(group.id), group]));
    const memberById = new Map(members.map((member) => [Number(member.id), member]));

    const groupResults = include.has("groups")
      ? groups
          .map((group) => {
            const haystack = `${group.name || ""} ${group.description || ""}`;
            if (!hasAllTokens(haystack, tokens)) return null;
            return {
              kind: "group",
              id: Number(group.id),
              name: String(group.name || ""),
              description: String(group.description || ""),
              href: `/group/${group.id}`,
              score: scoreText(haystack, tokens),
              createdAt: String(group.createdAt || ""),
            };
          })
          .filter(Boolean)
          .sort((a, b) => (b.score - a.score) || recentSort(a, b))
          .slice(0, limit)
      : [];

    const expenseResults = include.has("expenses")
      ? expenses
          .map((expense) => {
            const group = groupById.get(Number(expense.groupId));
            if (!group) return null;
            const payer = memberById.get(Number(expense.payerMemberId));
            const haystack = `${expense.title || ""} ${expense.notes || ""} ${expense.category || ""} ${group.name || ""} ${payer?.name || ""}`;
            if (!hasAllTokens(haystack, tokens)) return null;
            return {
              kind: "expense",
              id: Number(expense.id),
              groupId: Number(expense.groupId),
              title: String(expense.title || "Expense"),
              amount: Number(expense.amount || 0),
              currency: String(group.currency || "INR"),
              groupName: String(group.name || ""),
              href: `/group/${expense.groupId}`,
              score: scoreText(haystack, tokens),
              createdAt: String(expense.createdAt || expense.expenseDate || ""),
            };
          })
          .filter(Boolean)
          .sort((a, b) => (b.score - a.score) || recentSort(a, b))
          .slice(0, limit)
      : [];

    const activityResults = include.has("activity")
      ? activities
          .map((entry) => {
            const group = groupById.get(Number(entry.groupId));
            if (!group) return null;
            const haystack = `${entry.type || ""} ${entry.message || ""} ${group.name || ""}`;
            if (!hasAllTokens(haystack, tokens)) return null;
            return {
              kind: "activity",
              id: Number(entry.id),
              groupId: Number(entry.groupId),
              type: String(entry.type || "event"),
              message: String(entry.message || ""),
              groupName: String(group.name || ""),
              href: "/activity",
              score: scoreText(haystack, tokens),
              createdAt: String(entry.createdAt || ""),
            };
          })
          .filter(Boolean)
          .sort((a, b) => (b.score - a.score) || recentSort(a, b))
          .slice(0, limit)
      : [];

    const items = [...groupResults, ...expenseResults, ...activityResults]
      .sort((a, b) => (b.score - a.score) || recentSort(a, b))
      .slice(0, limit * 2);

    return NextResponse.json({
      query: q,
      total: items.length,
      groups: groupResults,
      expenses: expenseResults,
      activity: activityResults,
      items,
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to search" }, { status: 500 });
  }
}
