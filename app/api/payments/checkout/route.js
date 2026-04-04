import { NextResponse } from "next/server";
import { groupBundle, readDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  createPayPalOrder,
  createRazorpayOrder,
  createStripeCheckoutSession,
} from "@/lib/payments";
import {
  createRequestContext,
  errorDetails,
  logError,
  logInfo,
  logWarn,
  newErrorId,
} from "@/lib/logger";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const checkoutSchema = z
  .object({
    groupId: z.coerce.number().int().positive("groupId is required"),
    fromMemberId: z.coerce.number().int().positive("fromMemberId is required"),
    toMemberId: z.coerce.number().int().positive("toMemberId is required"),
    amount: z.coerce.number().finite().positive("amount must be positive"),
    currency: z.string().trim().max(3).optional().default(""),
    provider: z.enum(["razorpay", "stripe", "paypal"]),
    method: z.string().trim().max(80).optional().default(""),
    returnUrl: z.string().trim().max(600).optional().default(""),
  })
  .refine((payload) => payload.fromMemberId !== payload.toMemberId, {
    message: "fromMemberId and toMemberId must be different",
    path: ["toMemberId"],
  });

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many payment requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(seconds),
      },
    }
  );
}

function normalizeCurrency(value, fallback = "INR") {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) return code;
  return String(fallback || "INR")
    .trim()
    .toUpperCase();
}

function getProviderErrorMessage(error, fallback) {
  const raw = String(error?.message || "").trim();
  if (!raw) return fallback;
  const idx = raw.indexOf(":");
  if (idx === -1) return raw;
  const parsed = raw.slice(idx + 1).trim();
  return parsed || raw;
}

function providerNotConfiguredMessage(code) {
  if (code === "RAZORPAY_NOT_CONFIGURED") {
    return "Razorpay is not configured on this server.";
  }
  if (code === "STRIPE_NOT_CONFIGURED") {
    return "Stripe is not configured on this server.";
  }
  if (code === "PAYPAL_NOT_CONFIGURED") {
    return "PayPal is not configured on this server.";
  }
  return "";
}

function buildReturnUrls(request, returnUrl, provider) {
  const requestOrigin = request.nextUrl?.origin || new URL(request.url).origin;
  const fallbackPath = "/settle";

  let resolvedPath = fallbackPath;
  const input = String(returnUrl || "").trim();
  if (input) {
    try {
      const parsed = new URL(input, requestOrigin);
      if (parsed.origin === requestOrigin) {
        resolvedPath = `${parsed.pathname}${parsed.search}`;
      }
    } catch {
      resolvedPath = fallbackPath;
    }
  }

  const success = new URL(resolvedPath, requestOrigin);
  success.searchParams.set("payment_provider", provider);
  success.searchParams.set("payment_status", "success");

  const cancel = new URL(resolvedPath, requestOrigin);
  cancel.searchParams.set("payment_provider", provider);
  cancel.searchParams.set("payment_status", "cancelled");

  return {
    successUrl: success.toString(),
    cancelUrl: cancel.toString(),
  };
}

function resolveSettlementContext(db, payload, session) {
  const groupId = Number(payload.groupId);
  const fromMemberId = Number(payload.fromMemberId);
  const toMemberId = Number(payload.toMemberId);
  const amount = Number(payload.amount || 0);

  if (!hasGroupPermission(db, groupId, session, "markSettlementPaid")) {
    throw new Error("FORBIDDEN");
  }

  const group = groupBundle(db, groupId);
  if (!group) {
    throw new Error("GROUP_NOT_FOUND");
  }

  const payer = (group.members || []).find((item) => Number(item.id) === fromMemberId);
  const payee = (group.members || []).find((item) => Number(item.id) === toMemberId);
  if (!payer || !payee) {
    throw new Error("MEMBER_NOT_FOUND");
  }

  const pending = (group.summary?.settlements || []).find(
    (item) =>
      Number(item.fromMemberId) === fromMemberId &&
      Number(item.toMemberId) === toMemberId
  );
  if (!pending) {
    throw new Error("SETTLEMENT_NOT_FOUND");
  }

  if (amount - Number(pending.amount || 0) > 0.01) {
    throw new Error("SETTLEMENT_AMOUNT_EXCEEDS_PENDING");
  }

  return {
    group,
    payer,
    payee,
    pending,
    amount,
  };
}

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  const ctx = createRequestContext(request, "payments.checkout", {
    userId: Number(session.userId || 0),
  });
  const ip = getClientIp(request);

  try {
    const ipLimit = consumeRateLimit({
      key: `payments:checkout:ip:${ip}`,
      limit: 45,
      windowMs: 15 * 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      logWarn("payments.checkout_rate_limited_ip", {
        requestId: ctx.requestId,
        ip,
      });
      return rateLimitResponse(ipLimit.retryAfterMs);
    }

    const userLimit = consumeRateLimit({
      key: `payments:checkout:user:${Number(session.userId || 0) || 0}`,
      limit: 35,
      windowMs: 15 * 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });
    if (!userLimit.allowed) {
      logWarn("payments.checkout_rate_limited_user", {
        requestId: ctx.requestId,
        userId: Number(session.userId || 0) || null,
      });
      return rateLimitResponse(userLimit.retryAfterMs);
    }

    const payload = await parseRequestBody(request, checkoutSchema, {
      invalidJsonMessage: "Invalid payment checkout payload",
    });

    const db = await readDB();
    const settlement = resolveSettlementContext(db, payload, session);
    const currency = normalizeCurrency(payload.currency, settlement.group.currency || "INR");
    const provider = String(payload.provider || "").toLowerCase();
    const method = String(payload.method || "").trim();

    const descriptor = `${settlement.group.name}: ${settlement.payer.name} -> ${settlement.payee.name}`;
    const { successUrl, cancelUrl } = buildReturnUrls(request, payload.returnUrl, provider);

    let checkout = null;
    if (provider === "razorpay") {
      const order = await createRazorpayOrder({
        amount: settlement.amount,
        currency,
        receipt: `g${settlement.group.id}_s${Date.now()}`,
        notes: {
          groupId: String(settlement.group.id),
          fromMemberId: String(settlement.payer.id),
          toMemberId: String(settlement.payee.id),
          amount: String(settlement.amount),
          method: method || "razorpay",
        },
      });

      checkout = {
        provider: "razorpay",
        mode: "sdk",
        referenceId: order.orderId,
        orderId: order.orderId,
        keyId: order.keyId,
        amountMinor: Number(order.amount || 0),
        currency: normalizeCurrency(order.currency, currency),
      };
    } else if (provider === "stripe") {
      const successWithSession = new URL(successUrl);
      successWithSession.searchParams.set("checkout_session_id", "{CHECKOUT_SESSION_ID}");

      const stripe = await createStripeCheckoutSession({
        amount: settlement.amount,
        currency,
        description: `Settlement: ${descriptor}`.slice(0, 120),
        successUrl: successWithSession.toString(),
        cancelUrl,
        metadata: {
          groupId: String(settlement.group.id),
          fromMemberId: String(settlement.payer.id),
          toMemberId: String(settlement.payee.id),
          amount: String(settlement.amount),
          method: method || "stripe",
        },
      });

      checkout = {
        provider: "stripe",
        mode: "redirect",
        referenceId: stripe.sessionId,
        checkoutUrl: stripe.url || "",
        sessionId: stripe.sessionId,
        publishableKey: stripe.publishableKey,
        currency,
      };
    } else if (provider === "paypal") {
      const paypal = await createPayPalOrder({
        amount: settlement.amount,
        currency,
        description: `Settlement: ${descriptor}`.slice(0, 120),
        returnUrl: successUrl,
        cancelUrl,
      });

      checkout = {
        provider: "paypal",
        mode: "redirect",
        referenceId: paypal.orderId,
        checkoutUrl: paypal.approveUrl || "",
        orderId: paypal.orderId,
        status: paypal.status || "",
        clientId: paypal.clientId,
        env: paypal.env,
        currency,
      };
    } else {
      return NextResponse.json({ error: "Unsupported payment provider" }, { status: 400 });
    }

    if (!checkout?.referenceId) {
      throw new Error("PAYMENT_REFERENCE_MISSING");
    }

    logInfo("payments.checkout_created", {
      requestId: ctx.requestId,
      userId: Number(session.userId || 0) || null,
      groupId: Number(settlement.group.id),
      provider,
      amount: Number(settlement.amount),
      currency,
    });

    return NextResponse.json({
      success: true,
      checkout,
      settlement: {
        groupId: Number(settlement.group.id),
        fromMemberId: Number(settlement.payer.id),
        toMemberId: Number(settlement.payee.id),
        amount: Number(settlement.amount),
        currency,
      },
    });
  } catch (error) {
    const response = validationErrorResponse(error);
    if (response) return response;

    const code = String(error?.message || "").trim();
    if (code === "FORBIDDEN") {
      return NextResponse.json({ error: "Access denied for this group" }, { status: 403 });
    }
    if (code === "GROUP_NOT_FOUND") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (code === "MEMBER_NOT_FOUND") {
      return NextResponse.json({ error: "Could not resolve settlement members" }, { status: 400 });
    }
    if (code === "SETTLEMENT_NOT_FOUND") {
      return NextResponse.json(
        { error: "No pending settlement exists for this member pair." },
        { status: 400 }
      );
    }
    if (code === "SETTLEMENT_AMOUNT_EXCEEDS_PENDING") {
      return NextResponse.json(
        { error: "Requested amount exceeds pending settlement." },
        { status: 400 }
      );
    }

    const notConfigured = providerNotConfiguredMessage(code);
    if (notConfigured) {
      return NextResponse.json({ error: notConfigured }, { status: 400 });
    }

    if (code.includes("_FAILED")) {
      return NextResponse.json(
        { error: getProviderErrorMessage(error, "Payment provider request failed") },
        { status: 502 }
      );
    }

    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to initialize payment checkout");
    logError("payments.checkout_failed", {
      requestId: ctx.requestId,
      errorId,
      userId: Number(session.userId || 0) || null,
      ip,
      message: info.message,
      stack: info.stack,
    });
    return NextResponse.json({ error: info.message, errorId }, { status: 500 });
  }
}
