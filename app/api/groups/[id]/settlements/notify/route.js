import { NextResponse } from "next/server";
import { appendActivity, groupBundle, readDB, updateDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { enqueueSettlementNotification, processNotificationQueue } from "@/lib/notificationQueue";
import { createRequestContext, errorDetails, logError, logInfo, newErrorId } from "@/lib/logger";
import { hasWebPushConfig, sendWebPushBatch } from "@/lib/webPush";
import { parseRequestBody, parseRouteParams, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const groupParamsSchema = z.object({
  id: z.coerce.number().int().positive("Invalid group id"),
});
const settlementNotifySchema = z.object({
  fromMemberId: z.coerce.number().int().positive("Member mapping is required"),
  toMemberId: z.coerce.number().int().positive("Member mapping is required"),
  amount: z.coerce.number().finite().positive("Settlement amount must be positive"),
  channel: z.enum(["email", "sms", "whatsapp", "both", "all"]).default("email"),
  message: z.string().trim().max(1000, "Message is too long").optional().default(""),
});

async function resolveGroupId(paramsPromise) {
  const params = await parseRouteParams(paramsPromise, groupParamsSchema);
  return Number(params.id);
}

export async function POST(request, { params }) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;
  const ctx = createRequestContext(request, "groups.settlements.notify", {
    userId: Number(session.userId || 0),
  });

  try {
    const groupId = await resolveGroupId(params);
    if (!Number.isFinite(groupId)) {
      return NextResponse.json({ error: "Invalid group id" }, { status: 400 });
    }

    const payload = await parseRequestBody(request, settlementNotifySchema, {
      invalidJsonMessage: "Invalid settlement notification payload",
    });
    const fromMemberId = Number(payload.fromMemberId);
    const toMemberId = Number(payload.toMemberId);
    const amount = Number(payload.amount || 0);
    const channel = String(payload.channel || "email").toLowerCase();
    const customMessage = String(payload.message || "").trim();

    const db = await readDB();
    if (!hasGroupPermission(db, groupId, session, "notifySettlement")) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    const group = groupBundle(db, groupId);

    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const payer = group.members.find((member) => member.id === fromMemberId);
    const payee = group.members.find((member) => member.id === toMemberId);

    if (!payer || !payee) {
      return NextResponse.json({ error: "Could not resolve settlement members" }, { status: 400 });
    }

    const delivery = {};
    const wantsEmail = ["email", "both", "all"].includes(channel);
    const wantsSms = ["sms", "both", "all"].includes(channel);
    const wantsWhatsapp = ["whatsapp", "all"].includes(channel);
    const queued = [];
    if (wantsEmail) {
      delivery.email = { status: "queued", message: "Queued for delivery" };
      queued.push(
        await enqueueSettlementNotification({
          groupId: Number(group.id),
          groupName: group.name,
          fromMemberId: Number(payer.id),
          fromName: payer.name,
          toMemberId: Number(payee.id),
          toName: payee.name,
          amount: Number(amount),
          currency: group.currency,
          channel: "email",
          customMessage,
        })
      );
    }

    if (wantsSms) {
      delivery.sms = { status: "queued", message: "Queued for delivery" };
      queued.push(
        await enqueueSettlementNotification({
          groupId: Number(group.id),
          groupName: group.name,
          fromMemberId: Number(payer.id),
          fromName: payer.name,
          toMemberId: Number(payee.id),
          toName: payee.name,
          amount: Number(amount),
          currency: group.currency,
          channel: "sms",
          customMessage,
        })
      );
    }

    if (wantsWhatsapp) {
      delivery.whatsapp = { status: "queued", message: "Queued for delivery" };
      queued.push(
        await enqueueSettlementNotification({
          groupId: Number(group.id),
          groupName: group.name,
          fromMemberId: Number(payer.id),
          fromName: payer.name,
          toMemberId: Number(payee.id),
          toName: payee.name,
          amount: Number(amount),
          currency: group.currency,
          channel: "whatsapp",
          customMessage,
        })
      );
    }

    const queueResult = await processNotificationQueue({
      groupId: Number(group.id),
      jobIds: queued.map((item) => Number(item?.job?.id)).filter((id) => Number.isFinite(id) && id > 0),
      limit: Math.max(1, queued.length),
    });

    for (const item of queueResult.processed) {
      delivery[item.channel] = {
        status: item.status,
        provider: item.provider || null,
        id: item.providerId || null,
        message: item.message || "",
      };
    }

    const sentAny = Object.values(delivery).some((item) => item.status === "sent");
    const queuedAny = Object.values(delivery).some((item) => item.status === "queued");
    if (!sentAny && !queuedAny) {
      const failedSummary = Object.entries(delivery)
        .filter(([, item]) => item?.status !== "sent")
        .map(([key, item]) => `${key.toUpperCase()}: ${item?.message || "Failed"}`)
        .join(" | ");

      return NextResponse.json(
        {
          error: failedSummary
            ? `Notification could not be delivered. ${failedSummary}`
            : "Notification could not be delivered",
          delivery,
        },
        { status: 400 }
      );
    }

    await updateDB((draft) => {
      appendActivity(draft, {
        groupId: Number(group.id),
        type: "settlement_reminder",
        message: `Settlement reminder requested for ${payer.name} to pay ${payee.name}.`,
        createdByUserId: Number(session.userId || 0) || null,
      });
      return draft;
    });

    try {
      if (hasWebPushConfig()) {
        const payerUserId = Number(payer.userId || 0);
        if (payerUserId > 0) {
          const payerUser = (db.users || []).find((item) => Number(item.id) === payerUserId);
          const allowPush = !payerUser || payerUser.notificationPreferences?.settlementAlerts !== false;
          if (allowPush) {
            const subscriptions = (db.webPushSubscriptions || []).filter(
              (item) => Number(item.userId || 0) === payerUserId
            );
            const pushResult = await sendWebPushBatch(subscriptions, {
              title: `${group.name}: Settlement reminder`,
              body: `${payee.name} requested settlement of ${group.currency} ${Number(amount).toFixed(2)}.`,
              tag: `group-${group.id}-settlement`,
              url: "/",
            });
            if (pushResult.expiredEndpoints?.length) {
              await updateDB((draft) => {
                draft.webPushSubscriptions = (draft.webPushSubscriptions || []).filter(
                  (item) => !pushResult.expiredEndpoints.includes(String(item.endpoint || ""))
                );
                return draft;
              });
            }
          }
        }
      }
    } catch {
      // Ignore push failures to keep core notify flow resilient.
    }

    logInfo("settlement.notify_processed", {
      requestId: ctx.requestId,
      groupId: Number(group.id),
      queued: queued.length,
      sent: queueResult.counts.sent,
      failed: queueResult.counts.failed,
    });

    return NextResponse.json({
      success: true,
      delivery,
      logsCreated: queued.length,
      summary: `${payer.name} was notified for ${group.name}`,
    }, { status: sentAny ? 200 : 202 });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to notify settlement");
    logError("settlement.notify_failed", {
      requestId: ctx.requestId,
      errorId,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
