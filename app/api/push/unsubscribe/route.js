import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { updateDB } from "@/lib/store";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().max(2048, "Endpoint is too long").optional().default(""),
});

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await parseRequestBody(request, unsubscribeSchema, {
      invalidJsonMessage: "Invalid unsubscribe payload",
    });
    const endpoint = String(body.endpoint || "").trim();
    const userId = Number(session.userId || 0);

    await updateDB((draft) => {
      if (endpoint) {
        draft.webPushSubscriptions = (draft.webPushSubscriptions || []).filter(
          (item) => String(item.endpoint || "") !== endpoint
        );
      } else {
        draft.webPushSubscriptions = (draft.webPushSubscriptions || []).filter(
          (item) => Number(item.userId) !== userId
        );
      }
      return draft;
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to remove push subscription" }, { status: 500 });
  }
}
