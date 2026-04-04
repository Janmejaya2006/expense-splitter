import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { groupBundle, readDB } from "@/lib/store";
import { getConfigHealth } from "@/lib/configHealth";
import { scopeDbForUser } from "@/lib/access";

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  const startedAt = nowMs();
  try {
    const readStartedAt = nowMs();
    const db = await readDB();
    const dbReadMs = Number((nowMs() - readStartedAt).toFixed(2));

    const composeStartedAt = nowMs();
    const scoped = scopeDbForUser(db, session);
    const config = getConfigHealth();
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    const notificationQueue = Array.isArray(scoped.notificationQueue) ? scoped.notificationQueue : [];
    const queueQueued = notificationQueue.filter((item) => String(item.status || "") === "queued").length;
    const queueFailed = notificationQueue.filter((item) => String(item.status || "") === "failed").length;
    const queueSent = notificationQueue.filter((item) => String(item.status || "") === "sent").length;

    const activities = Array.isArray(scoped.activityLogs) ? scoped.activityLogs : [];
    const activityLast24h = activities.filter((item) => {
      const ms = new Date(item.createdAt || 0).getTime();
      return Number.isFinite(ms) && ms >= now - dayMs;
    }).length;

    const settlementsPending = (scoped.groups || []).reduce((acc, group) => {
      const bundle = groupBundle(scoped, Number(group.id));
      const entries = Array.isArray(bundle?.summary?.settlements) ? bundle.summary.settlements : [];
      return acc + entries.length;
    }, 0);

    const composeMs = Number((nowMs() - composeStartedAt).toFixed(2));
    const totalMs = Number((nowMs() - startedAt).toFixed(2));

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      health: {
        configOk: Boolean(config.ok),
        configScore: Number(config.score || 0),
        requiredFailures: Number((config.checks || []).filter((item) => item.required && item.status === "fail").length),
      },
      counts: {
        groups: Number((scoped.groups || []).length),
        expenses: Number((scoped.expenses || []).length),
        members: Number((scoped.members || []).length),
        payments: Number((scoped.settlementPayments || []).length),
        pendingSettlements: Number(settlementsPending || 0),
      },
      queue: {
        queued: queueQueued,
        failed: queueFailed,
        sent: queueSent,
      },
      activity: {
        last24h: activityLast24h,
      },
      latency: {
        dbReadMs,
        composeMs,
        totalMs,
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to load ops health" }, { status: 500 });
  }
}
