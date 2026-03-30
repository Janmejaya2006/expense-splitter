import { nowISO, readDB, updateDB } from "@/lib/store";
import { sendSettlementEmail, sendSettlementSms, sendSettlementWhatsapp } from "@/lib/notifications";
import { logError, logInfo } from "@/lib/logger";

const MAX_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 60 * 1000;
const MAX_RETRY_DELAY_MS = 30 * 60 * 1000;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function providerForChannel(channel) {
  return channel === "email" ? "resend" : "twilio";
}

function normalizeChannel(channel) {
  const value = String(channel || "").trim().toLowerCase();
  return ["email", "sms", "whatsapp"].includes(value) ? value : "";
}

function nextRetryAt(attemptNumber) {
  const expDelay = BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptNumber - 1);
  const delay = Math.min(MAX_RETRY_DELAY_MS, expDelay);
  return new Date(Date.now() + delay).toISOString();
}

function isDue(job, nowMs) {
  const nextAt = new Date(job.nextAttemptAt || 0).getTime();
  const next = Number.isFinite(nextAt) ? nextAt : 0;
  return next <= nowMs;
}

function targetForChannel(channel, payer) {
  if (channel === "email") return String(payer?.email || "").trim();
  if (channel === "sms" || channel === "whatsapp") return String(payer?.phone || "").trim();
  return "";
}

async function sendByChannel({ channel, payer, payee, amount, currency, groupName, customMessage }) {
  if (channel === "email") {
    return sendSettlementEmail({
      toEmail: String(payer?.email || "").trim(),
      fromName: payer?.name,
      toName: payee?.name,
      amount,
      currency,
      groupName,
      customMessage,
    });
  }

  if (channel === "sms") {
    return sendSettlementSms({
      toPhone: String(payer?.phone || "").trim(),
      fromName: payer?.name,
      toName: payee?.name,
      amount,
      currency,
      groupName,
      customMessage,
    });
  }

  if (channel === "whatsapp") {
    return sendSettlementWhatsapp({
      toPhone: String(payer?.phone || "").trim(),
      fromName: payer?.name,
      toName: payee?.name,
      amount,
      currency,
      groupName,
      customMessage,
    });
  }

  throw new Error("Unsupported notification channel");
}

export async function enqueueSettlementNotification({
  groupId,
  groupName,
  fromMemberId,
  fromName,
  toMemberId,
  toName,
  amount,
  currency,
  channel,
  customMessage = "",
  retryCount = 0,
  retryOfLogId = null,
}) {
  const safeChannel = normalizeChannel(channel);
  if (!safeChannel) {
    throw new Error("Unsupported notification channel");
  }

  let created = null;
  await updateDB((draft) => {
    const createdAt = nowISO();
    const logId = Number(draft.meta.nextNotificationLogId);
    draft.meta.nextNotificationLogId += 1;

    const log = {
      id: logId,
      groupId: toNumber(groupId),
      groupName: String(groupName || ""),
      fromMemberId: toNumber(fromMemberId),
      fromName: String(fromName || ""),
      toMemberId: toNumber(toMemberId),
      toName: String(toName || ""),
      amount: toNumber(amount),
      currency: String(currency || "INR"),
      customMessage: String(customMessage || ""),
      createdAt,
      channel: safeChannel,
      status: "queued",
      provider: providerForChannel(safeChannel),
      providerId: null,
      message: "Queued for delivery",
      target: "",
      retryCount: toNumber(retryCount),
      retryOfLogId: retryOfLogId ? toNumber(retryOfLogId) : null,
      webhookStatus: null,
      webhookUpdatedAt: null,
      lastRetriedAt: null,
    };
    draft.notificationLogs.push(log);

    const jobId = Number(draft.meta.nextNotificationJobId);
    draft.meta.nextNotificationJobId += 1;

    const job = {
      id: jobId,
      groupId: toNumber(groupId),
      logId,
      channel: safeChannel,
      fromMemberId: toNumber(fromMemberId),
      toMemberId: toNumber(toMemberId),
      amount: toNumber(amount),
      currency: String(currency || "INR"),
      customMessage: String(customMessage || ""),
      groupName: String(groupName || ""),
      status: "queued",
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextAttemptAt: createdAt,
      createdAt,
      updatedAt: createdAt,
      lastError: "",
      completedAt: null,
    };
    draft.notificationQueue.push(job);

    created = { job, log };
    return draft;
  });

  return created;
}

export async function enqueueRetryFromLog({ groupId, logId }) {
  const db = await readDB();
  const sourceLog = (db.notificationLogs || []).find(
    (item) => Number(item.id) === Number(logId) && Number(item.groupId) === Number(groupId)
  );
  if (!sourceLog) {
    throw new Error("Notification log not found");
  }

  const channel = normalizeChannel(sourceLog.channel);
  if (!channel) {
    throw new Error("Only email/sms/whatsapp logs can be retried");
  }

  return enqueueSettlementNotification({
    groupId: sourceLog.groupId,
    groupName: sourceLog.groupName,
    fromMemberId: sourceLog.fromMemberId,
    fromName: sourceLog.fromName,
    toMemberId: sourceLog.toMemberId,
    toName: sourceLog.toName,
    amount: sourceLog.amount,
    currency: sourceLog.currency,
    channel,
    customMessage: sourceLog.customMessage,
    retryCount: toNumber(sourceLog.retryCount) + 1,
    retryOfLogId: sourceLog.id,
  });
}

export async function processNotificationQueue({ groupId = null, jobIds = null, limit = 20 } = {}) {
  const db = await readDB();
  const nowMs = Date.now();
  const requestedJobIds = new Set((jobIds || []).map((id) => toNumber(id)).filter((id) => id > 0));
  const useJobFilter = requestedJobIds.size > 0;

  const candidates = (db.notificationQueue || [])
    .filter((job) => String(job.status || "") === "queued")
    .filter((job) => (groupId ? Number(job.groupId) === Number(groupId) : true))
    .filter((job) => (useJobFilter ? requestedJobIds.has(Number(job.id)) : true))
    .filter((job) => toNumber(job.attempts) < toNumber(job.maxAttempts || MAX_ATTEMPTS, MAX_ATTEMPTS))
    .filter((job) => isDue(job, nowMs))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(0, Math.max(1, Number(limit) || 1));

  const results = [];

  for (const candidate of candidates) {
    const jobId = Number(candidate.id);
    let claimed = false;

    await updateDB((draft) => {
      const job = (draft.notificationQueue || []).find((item) => Number(item.id) === jobId);
      if (!job || String(job.status || "") !== "queued") return draft;
      job.status = "processing";
      job.updatedAt = nowISO();
      claimed = true;
      return draft;
    });

    if (!claimed) continue;

    const fresh = await readDB();
    const job = (fresh.notificationQueue || []).find((item) => Number(item.id) === jobId);
    if (!job) continue;

    const group = (fresh.groups || []).find((item) => Number(item.id) === Number(job.groupId));
    const payer = (fresh.members || []).find((item) => Number(item.id) === Number(job.fromMemberId));
    const payee = (fresh.members || []).find((item) => Number(item.id) === Number(job.toMemberId));

    if (!group || !payer || !payee) {
      await updateDB((draft) => {
        const pending = (draft.notificationQueue || []).find((item) => Number(item.id) === jobId);
        const log = (draft.notificationLogs || []).find((item) => Number(item.id) === Number(job.logId));
        if (!pending) return draft;
        pending.status = "failed";
        pending.updatedAt = nowISO();
        pending.lastError = "Missing group/member mapping";
        pending.attempts = toNumber(pending.attempts) + 1;
        if (log) {
          log.status = "failed";
          log.message = "Missing group/member mapping";
          log.retryCount = toNumber(pending.attempts);
          log.lastRetriedAt = nowISO();
        }
        return draft;
      });
      results.push({
        jobId,
        logId: Number(job.logId),
        channel: String(job.channel || ""),
        status: "failed",
        message: "Missing group/member mapping",
      });
      continue;
    }

    try {
      const sendResult = await sendByChannel({
        channel: String(job.channel || ""),
        payer,
        payee,
        amount: toNumber(job.amount),
        currency: String(job.currency || group.currency || "INR"),
        groupName: String(job.groupName || group.name || ""),
        customMessage: String(job.customMessage || ""),
      });

      const target = targetForChannel(String(job.channel || ""), payer);
      await updateDB((draft) => {
        const pending = (draft.notificationQueue || []).find((item) => Number(item.id) === jobId);
        const log = (draft.notificationLogs || []).find((item) => Number(item.id) === Number(job.logId));
        if (!pending) return draft;

        pending.status = "sent";
        pending.attempts = toNumber(pending.attempts) + 1;
        pending.updatedAt = nowISO();
        pending.completedAt = nowISO();
        pending.lastError = "";

        if (log) {
          log.status = "sent";
          log.provider = sendResult.provider || providerForChannel(String(job.channel || ""));
          log.providerId = sendResult.id || null;
          log.message = sendResult.message || "Message sent successfully";
          log.target = target;
          log.retryCount = toNumber(pending.attempts);
          log.lastRetriedAt = nowISO();
        }
        return draft;
      });

      logInfo("notification.sent", {
        groupId: Number(job.groupId),
        logId: Number(job.logId),
        channel: String(job.channel || ""),
        provider: sendResult.provider || providerForChannel(String(job.channel || "")),
      });

      results.push({
        jobId,
        logId: Number(job.logId),
        channel: String(job.channel || ""),
        status: "sent",
        provider: sendResult.provider || providerForChannel(String(job.channel || "")),
        providerId: sendResult.id || null,
        message: sendResult.message || "Message sent successfully",
      });
    } catch (error) {
      const attempts = toNumber(job.attempts) + 1;
      const maxAttempts = toNumber(job.maxAttempts || MAX_ATTEMPTS, MAX_ATTEMPTS);
      const willRetry = attempts < maxAttempts;
      const errorMessage = error instanceof Error ? error.message || "Notification failed" : "Notification failed";
      const queuedNextAt = willRetry ? nextRetryAt(attempts) : null;

      await updateDB((draft) => {
        const pending = (draft.notificationQueue || []).find((item) => Number(item.id) === jobId);
        const log = (draft.notificationLogs || []).find((item) => Number(item.id) === Number(job.logId));
        if (!pending) return draft;

        pending.attempts = attempts;
        pending.updatedAt = nowISO();
        pending.lastError = errorMessage;
        pending.status = willRetry ? "queued" : "failed";
        pending.nextAttemptAt = queuedNextAt || pending.nextAttemptAt;
        if (!willRetry) {
          pending.completedAt = nowISO();
        }

        if (log) {
          log.status = "failed";
          log.provider = providerForChannel(String(job.channel || ""));
          log.message = willRetry
            ? `${errorMessage}. Auto-retry scheduled.`
            : `${errorMessage}. Max retries reached.`;
          log.target = log.target || targetForChannel(String(job.channel || ""), payer);
          log.retryCount = attempts;
          log.lastRetriedAt = nowISO();
        }
        return draft;
      });

      logError("notification.failed", {
        groupId: Number(job.groupId),
        logId: Number(job.logId),
        channel: String(job.channel || ""),
        attempts,
        willRetry,
        error: errorMessage,
      });

      results.push({
        jobId,
        logId: Number(job.logId),
        channel: String(job.channel || ""),
        status: "failed",
        willRetry,
        message: errorMessage,
      });
    }
  }

  return {
    processed: results,
    counts: {
      sent: results.filter((item) => item.status === "sent").length,
      failed: results.filter((item) => item.status === "failed").length,
      total: results.length,
    },
  };
}
