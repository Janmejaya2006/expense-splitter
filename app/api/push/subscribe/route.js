import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { nowISO, updateDB } from "@/lib/store";
import { hasWebPushConfig, normalizePushSubscription } from "@/lib/webPush";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const subscribeSchema = z.object({
  subscription: z.unknown(),
});

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  if (!hasWebPushConfig()) {
    return NextResponse.json({ error: "Web Push is not configured on server." }, { status: 503 });
  }

  try {
    const body = await parseRequestBody(request, subscribeSchema, {
      invalidJsonMessage: "Invalid push subscription payload",
    });
    const subscription = normalizePushSubscription(body.subscription);
    if (!subscription) {
      return NextResponse.json({ error: "Invalid push subscription payload" }, { status: 400 });
    }

    await updateDB((draft) => {
      const existing = (draft.webPushSubscriptions || []).find(
        (item) => String(item.endpoint || "") === subscription.endpoint
      );
      const updatedAt = nowISO();
      if (existing) {
        existing.userId = Number(session.userId || 0);
        existing.keys = subscription.keys;
        existing.updatedAt = updatedAt;
        existing.lastError = "";
      } else {
        const id = Number(draft.meta.nextWebPushSubscriptionId);
        draft.meta.nextWebPushSubscriptionId += 1;
        draft.webPushSubscriptions.push({
          id,
          userId: Number(session.userId || 0),
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          createdAt: updatedAt,
          updatedAt,
          lastSuccessAt: "",
          lastError: "",
        });
      }
      return draft;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to save push subscription" }, { status: 500 });
  }
}
