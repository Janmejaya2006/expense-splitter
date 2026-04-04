import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const expenseProxySchema = z.object({
  groupId: z.coerce.number().int().positive("groupId is required"),
  title: z.string().trim().min(1, "Expense title is required").max(160, "Expense title is too long"),
  amount: z.coerce.number().positive("Amount must be positive"),
  payerMemberId: z.coerce.number().int().positive("Valid payer is required"),
  participants: z.array(z.coerce.number().int().positive()).min(1, "At least one participant is required"),
  splitMode: z.enum(["equal", "percent", "shares"]).default("equal"),
  splitConfig: z.unknown().optional().nullable(),
  category: z.string().trim().max(80).optional().default("Misc"),
  expenseDate: z.string().trim().optional().default(""),
  notes: z.string().trim().max(1000).optional().default(""),
  recurring: z
    .object({
      enabled: z.boolean().optional().default(false),
      dayOfMonth: z.coerce.number().int().min(1).max(28).optional().default(1),
    })
    .optional()
    .nullable(),
  allowDuplicate: z.boolean().optional().default(false),
  proof: z
    .object({
      name: z.string().trim().optional().default(""),
      type: z.string().trim().optional().default(""),
      base64: z.string().trim().optional().default(""),
    })
    .optional()
    .nullable(),
  currency: z.string().trim().optional().default(""),
});

export async function POST(request) {
  const { unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const payload = await parseRequestBody(request, expenseProxySchema, {
      invalidJsonMessage: "Invalid expense payload",
    });
    const { groupId, ...body } = payload;

    const target = new URL(`/api/groups/${groupId}/expenses`, request.url);
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
    return NextResponse.json({ error: "Failed to create expense" }, { status: 500 });
  }
}
