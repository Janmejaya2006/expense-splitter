import { appendActivity, buildGroupSummary, nowISO, readDB, updateDB } from "@/lib/store";
import { processNotificationQueue } from "@/lib/notificationQueue";
import { logError, logInfo } from "@/lib/logger";
import { sendMonthlySummaryEmail } from "@/lib/notifications";

const QUEUE_RETENTION_DAYS = 30;

function monthKeyUtc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function isoDateUtcForDay(date, dayOfMonth) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dayOfMonth).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousMonthKeyUtc(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return monthKeyUtc(d);
}

function monthKeyForValue(value) {
  const ms = new Date(value || "").getTime();
  if (!Number.isFinite(ms)) return "";
  return monthKeyUtc(new Date(ms));
}

function monthLabel(monthKey) {
  const [yearText, monthText] = String(monthKey || "").split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return monthKey || "Unknown month";
  }
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function monthDiffInsight(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev <= 0) {
    if (cur > 0) {
      return "This month had spend activity while previous month had none.";
    }
    return "";
  }
  const diffPct = Number((((cur - prev) / prev) * 100).toFixed(1));
  if (Math.abs(diffPct) < 5) {
    return "Spending stayed roughly stable compared with previous month.";
  }
  return diffPct > 0
    ? `You spent ${diffPct}% more than previous month.`
    : `You spent ${Math.abs(diffPct)}% less than previous month.`;
}

export async function runMaintenanceJobs({ notificationLimit = 25 } = {}) {
  const startedAt = Date.now();
  const now = Date.now();
  const nowDate = new Date();
  const runMonth = monthKeyUtc(nowDate);
  const runDay = nowDate.getUTCDate();
  let expiredInvites = 0;
  let cleanedQueueItems = 0;
  let recurringExpensesAdded = 0;
  let monthlySummaryEmailsSent = 0;
  let monthlySummaryGroupsProcessed = 0;
  let monthlySummaryGroupsSkipped = 0;

  await updateDB((draft) => {
    for (const invite of draft.groupInvites || []) {
      if (String(invite.status || "").toLowerCase() !== "pending") continue;
      const expiresMs = new Date(invite.expiresAt || 0).getTime();
      if (!Number.isFinite(expiresMs) || expiresMs > now) continue;
      invite.status = "expired";
      invite.expiredAt = nowISO();
      expiredInvites += 1;
    }

    const retentionCutoff = now - QUEUE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const beforeCount = (draft.notificationQueue || []).length;
    draft.notificationQueue = (draft.notificationQueue || []).filter((job) => {
      const status = String(job.status || "").toLowerCase();
      if (status !== "sent" && status !== "failed") return true;
      const updatedMs = new Date(job.updatedAt || job.createdAt || 0).getTime();
      if (!Number.isFinite(updatedMs)) return false;
      return updatedMs >= retentionCutoff;
    });
    cleanedQueueItems = beforeCount - draft.notificationQueue.length;

    for (const recurring of draft.recurringExpenses || []) {
      if (recurring.active === false) continue;

      const groupId = Number(recurring.groupId || 0);
      const group = (draft.groups || []).find((item) => Number(item.id) === groupId);
      if (!group) continue;

      const dayOfMonth = Math.min(28, Math.max(1, Number(recurring.dayOfMonth || 1)));
      if (runDay < dayOfMonth) continue;
      if (String(recurring.lastRunMonth || "") === runMonth) continue;

      const validMembers = (draft.members || [])
        .filter((item) => Number(item.groupId) === groupId)
        .map((item) => Number(item.id));
      if (!validMembers.includes(Number(recurring.payerMemberId || 0))) continue;

      const participants = (recurring.participants || [])
        .map((id) => Number(id))
        .filter((id) => validMembers.includes(id));
      if (!participants.length) continue;

      const expenseId = Number(draft.meta.nextExpenseId);
      draft.meta.nextExpenseId += 1;
      const createdAt = nowISO();

      draft.expenses.push({
        id: expenseId,
        groupId,
        title: String(recurring.title || "Recurring expense"),
        amount: Number(recurring.amount || 0),
        sourceAmount: Number(recurring.sourceAmount || recurring.amount || 0),
        sourceCurrency: String(recurring.sourceCurrency || group.currency || "INR"),
        fxRateToGroup: Number(recurring.fxRateToGroup || 1),
        fxProvider: String(recurring.fxProvider || "identity"),
        fxFetchedAt: String(recurring.fxFetchedAt || createdAt),
        payerMemberId: Number(recurring.payerMemberId || 0),
        participants,
        splitMode: String(recurring.splitMode || "equal"),
        splitConfig: recurring.splitConfig || null,
        category: String(recurring.category || "Misc"),
        expenseDate: isoDateUtcForDay(nowDate, dayOfMonth),
        notes: String(recurring.notes || ""),
        proofName: "",
        proofMimeType: "",
        proofPath: "",
        proofBytes: 0,
        proofHash: "",
        proofStorage: null,
        recurringRuleId: Number(recurring.id || 0) || null,
        createdAt,
      });

      recurring.lastRunMonth = runMonth;
      recurring.updatedAt = createdAt;
      recurringExpensesAdded += 1;

      appendActivity(draft, {
        groupId,
        type: "recurring_applied",
        message: `Recurring expense "${recurring.title}" auto-added for ${runMonth}.`,
        createdByUserId: null,
        relatedExpenseId: expenseId,
      });
    }

    return draft;
  });

  if (runDay === 1) {
    const summaryDb = await readDB();
    const targetMonth = previousMonthKeyUtc(nowDate);
    const compareMonth = previousMonthKeyUtc(new Date(`${targetMonth}-01T00:00:00.000Z`));
    const groupsToMark = [];

    for (const group of summaryDb.groups || []) {
      if (String(group.lastMonthlySummaryMonth || "") === targetMonth) {
        monthlySummaryGroupsSkipped += 1;
        continue;
      }

      const groupId = Number(group.id);
      const members = (summaryDb.members || []).filter((item) => Number(item.groupId) === groupId);
      const monthlyExpenses = (summaryDb.expenses || []).filter(
        (item) => Number(item.groupId) === groupId && monthKeyForValue(item.expenseDate || item.createdAt) === targetMonth
      );
      const monthlyPayments = (summaryDb.settlementPayments || []).filter(
        (item) => Number(item.groupId) === groupId && monthKeyForValue(item.createdAt) === targetMonth
      );
      const previousExpenses = (summaryDb.expenses || []).filter(
        (item) => Number(item.groupId) === groupId && monthKeyForValue(item.expenseDate || item.createdAt) === compareMonth
      );
      const previousPayments = (summaryDb.settlementPayments || []).filter(
        (item) => Number(item.groupId) === groupId && monthKeyForValue(item.createdAt) === compareMonth
      );

      const summary = buildGroupSummary(group, members, monthlyExpenses, monthlyPayments);
      const previousSummary = buildGroupSummary(group, members, previousExpenses, previousPayments);
      const topCategory = summary.categoryBreakdown?.[0] || null;
      const insights = [];
      const diffLine = monthDiffInsight(summary.totalSpent, previousSummary.totalSpent);
      if (diffLine) insights.push(diffLine);
      if (topCategory?.category) {
        insights.push(
          `Top category was ${topCategory.category} at ${group.currency || "INR"} ${Number(topCategory.amount || 0).toFixed(2)}.`
        );
      }
      if ((summary.settlements || []).length > 0) {
        insights.push(`There are ${(summary.settlements || []).length} pending settlements to close.`);
      }

      const recipients = Array.from(
        new Set(
          members
            .map((member) => String(member.email || "").trim().toLowerCase())
            .filter(Boolean)
        )
      );

      let sentForGroup = 0;
      for (const email of recipients) {
        try {
          const member = members.find((item) => String(item.email || "").trim().toLowerCase() === email);
          await sendMonthlySummaryEmail({
            toEmail: email,
            recipientName: member?.name || "",
            groupName: group.name,
            monthLabel: monthLabel(targetMonth),
            currency: group.currency || "INR",
            totalSpent: summary.totalSpent,
            expenseCount: summary.expenseCount,
            settledAmount: summary.settledAmount,
            pendingSettlementCount: (summary.settlements || []).length,
            topCategories: summary.categoryBreakdown || [],
            insightLines: insights,
          });
          sentForGroup += 1;
        } catch (error) {
          logError("jobs.monthly_summary_email_failed", {
            groupId,
            email,
            month: targetMonth,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      if (sentForGroup > 0 || recipients.length === 0) {
        groupsToMark.push(groupId);
      }
      monthlySummaryEmailsSent += sentForGroup;
      monthlySummaryGroupsProcessed += 1;
    }

    if (groupsToMark.length) {
      await updateDB((draft) => {
        for (const group of draft.groups || []) {
          if (!groupsToMark.includes(Number(group.id))) continue;
          group.lastMonthlySummaryMonth = targetMonth;
          appendActivity(draft, {
            groupId: Number(group.id),
            type: "monthly_summary_sent",
            message: `Monthly summary email processed for ${monthLabel(targetMonth)}.`,
            createdByUserId: null,
          });
        }
        return draft;
      });
    }
  }

  let queue = { processed: [], counts: { sent: 0, failed: 0, total: 0 } };
  try {
    queue = await processNotificationQueue({ limit: notificationLimit });
  } catch (error) {
    logError("jobs.notification_queue_failed", {
      error: error instanceof Error ? error.message : "Unknown queue error",
    });
  }

  const completedAt = Date.now();
  const result = {
    success: true,
    expiredInvites,
    cleanedQueueItems,
    recurringExpensesAdded,
    monthlySummaryEmailsSent,
    monthlySummaryGroupsProcessed,
    monthlySummaryGroupsSkipped,
    notificationQueue: queue.counts,
    durationMs: completedAt - startedAt,
  };

  logInfo("jobs.maintenance_completed", result);
  return result;
}
