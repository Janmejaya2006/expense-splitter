import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { readDB, groupBundle } from "@/lib/store";
import { scopeDbForUser } from "@/lib/access";

export async function GET(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = verifySessionToken(token);
  if (!session) {
    return NextResponse.json({ authenticated: false, session: null });
  }

  try {
    const db = await readDB();
    const scoped = scopeDbForUser(db, session);
    const groups = Array.isArray(scoped.groups) ? scoped.groups : [];
    const members = Array.isArray(scoped.members) ? scoped.members : [];
    const groupIds = groups.map((group) => Number(group.id)).filter((id) => Number.isFinite(id) && id > 0);
    const expenses = (scoped.expenses || []).filter((item) => groupIds.includes(Number(item.groupId)));
    const hasInvitedMember = members.length > groups.length;

    const hasPendingSettlement = groupIds.some((groupId) => {
      const bundle = groupBundle(scoped, groupId);
      return Boolean((bundle?.summary?.settlements || []).length);
    });

    const onboarding = {
      groupsCount: groups.length,
      expensesCount: expenses.length,
      hasPendingSettlement,
      nextStep:
        groups.length === 0
          ? "create_group"
          : expenses.length === 0
            ? "add_expense"
            : !hasInvitedMember
              ? "invite_member"
              : hasPendingSettlement
                ? "settle_up"
                : "dashboard",
    };

    return NextResponse.json({
      authenticated: true,
      session,
      onboarding,
    });
  } catch {
    return NextResponse.json({ authenticated: true, session });
  }
}
