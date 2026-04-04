import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const notifyProxySchema = z.object({
  groupId: z.coerce.number().int().positive("groupId is required"),
  fromMemberId: z.coerce.number().int().positive("fromMemberId is required"),
  toMemberId: z.coerce.number().int().positive("toMemberId is required"),
  amount: z.coerce.number().positive("amount must be positive"),
  channel: z.enum(["email", "sms", "whatsapp", "both", "all"]).optional().default("all"),
  message: z.string().trim().max(1000).optional().default(""),
});

export async function POST(request) {
  const { unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const payload = await parseRequestBody(request, notifyProxySchema, {
      invalidJsonMessage: "Invalid notification payload",
    });
    const { groupId, ...body } = payload;

    const target = new URL(`/api/groups/${groupId}/settlements/notify`, request.url);
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: String(request.headers.get("cookie") || ""),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: "Failed to send notification" }, { status: 500 });
  }
}
