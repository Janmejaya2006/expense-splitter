import { NextResponse } from "next/server";
import { groupBundle, readDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { hasGroupPermission } from "@/lib/access";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import {
  capturePayPalOrder,
  getPayPalOrder,
  retrieveStripeCheckoutSession,
  verifyRazorpayPaymentSignature,
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

const verifySchema = z
  .object({
    groupId: z.coerce.number().int().positive("groupId is required"),
    fromMemberId: z.coerce.number().int().positive("fromMemberId is required"),
    toMemberId: z.coerce.number().int().positive("toMemberId is required"),
    amount: z.coerce.number().finite().positive("amount must be positive"),
    currency: z.string().trim().max(3).optional().default(""),
    provider: z.enum(["razorpay", "stripe", "paypal"]),
    referenceId: z.string().trim().max(220).optional().default(""),
    method: z.string().trim().max(80).optional().default(""),
    razorpay: z
      .object({
        orderId: z.string().trim().min(1, "Razorpay order id is required").max(120),
        paymentId: z.string().trim().min(1, "Razorpay payment id is required").max(120),
        signature: z.string().trim().min(1, "Razorpay signature is required").max(200),
      })
      .optional()
      .nullable(),
  })
  .refine((payload) => payload.fromMemberId !== payload.toMemberId, {
    message: "fromMemberId and toMemberId must be different",
    path: ["toMemberId"],
  });

const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many payment verification attempts. Please try again shortly." },
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

function fromMinorAmount(amountMinor, currency) {
  const minor = Number(amountMinor || 0);
  if (!Number.isFinite(minor)) return 0;
  const code = normalizeCurrency(currency, "INR");
  if (ZERO_DECIMAL_CURRENCIES.has(code)) {
    return minor;
  }
  return minor / 100;
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

function extractPayPalCaptureAmount(orderBody, fallbackCurrency) {
  const purchaseUnits = Array.isArray(orderBody?.purchase_units) ? orderBody.purchase_units : [];
  let total = 0;
  let currency = normalizeCurrency(fallbackCurrency, "USD");

  for (const unit of purchaseUnits) {
    const captures = Array.isArray(unit?.payments?.captures) ? unit.payments.captures : [];
    for (const capture of captures) {
      const status = String(capture?.status || "").toUpperCase();
      if (status !== "COMPLETED") continue;
      const amountValue = Number(capture?.amount?.value || 0);
      if (!Number.isFinite(amountValue) || amountValue <= 0) continue;
      total += amountValue;
      currency = normalizeCurrency(capture?.amount?.currency_code, currency);
    }
  }

  return {
    amount: Number(total.toFixed(2)),
    currency,
  };
}

async function verifyStripePayment(payload, settlement) {
  const sessionId = String(payload.referenceId || "").trim();
  if (!sessionId) {
    throw new Error("STRIPE_SESSION_REQUIRED");
  }

  const session = await retrieveStripeCheckoutSession(sessionId);
  const paymentStatus = String(session?.payment_status || "").trim().toLowerCase();
  if (paymentStatus !== "paid") {
    const pending = new Error("PAYMENT_PENDING");
    pending.provider = "stripe";
    throw pending;
  }

  const currency = normalizeCurrency(session?.currency, settlement.group.currency || payload.currency || "USD");
  const amount = fromMinorAmount(session?.amount_total, currency);

  return {
    provider: "stripe",
    referenceId: sessionId,
    status: "verified",
    amount: amount > 0 ? Number(amount.toFixed(2)) : Number(settlement.amount.toFixed(2)),
    currency,
    method: payload.method || "Stripe",
  };
}

async function verifyPayPalPayment(payload, settlement) {
  const orderId = String(payload.referenceId || "").trim();
  if (!orderId) {
    throw new Error("PAYPAL_ORDER_REQUIRED");
  }

  try {
    await capturePayPalOrder(orderId);
  } catch (error) {
    const message = String(error?.message || "");
    const providerMessage = getProviderErrorMessage(error, "PayPal capture failed");
    const lower = providerMessage.toLowerCase();
    const pendingLike =
      message.startsWith("PAYPAL_CAPTURE_FAILED:") &&
      (lower.includes("not approved") ||
        lower.includes("payer action") ||
        lower.includes("order status") ||
        lower.includes("unprocessable"));
    if (pendingLike) {
      const pending = new Error("PAYMENT_PENDING");
      pending.provider = "paypal";
      throw pending;
    }
    throw error;
  }

  const order = await getPayPalOrder(orderId);
  const status = String(order?.status || "").trim().toUpperCase();
  if (status !== "COMPLETED") {
    const pending = new Error("PAYMENT_PENDING");
    pending.provider = "paypal";
    throw pending;
  }

  const captured = extractPayPalCaptureAmount(order, settlement.group.currency || payload.currency || "USD");
  return {
    provider: "paypal",
    referenceId: orderId,
    status: "verified",
    amount: captured.amount > 0 ? captured.amount : Number(settlement.amount.toFixed(2)),
    currency: captured.currency,
    method: payload.method || "PayPal",
  };
}

async function verifyRazorpayPayment(payload, settlement) {
  const details = payload.razorpay;
  if (!details) {
    throw new Error("RAZORPAY_SIGNATURE_INVALID");
  }

  const valid = verifyRazorpayPaymentSignature({
    orderId: details.orderId,
    paymentId: details.paymentId,
    signature: details.signature,
  });
  if (!valid) {
    throw new Error("RAZORPAY_SIGNATURE_INVALID");
  }

  return {
    provider: "razorpay",
    referenceId: String(details.paymentId || details.orderId || "").trim(),
    status: "verified",
    amount: Number(settlement.amount.toFixed(2)),
    currency: normalizeCurrency(payload.currency, settlement.group.currency || "INR"),
    method: payload.method || "Razorpay",
  };
}

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  const ctx = createRequestContext(request, "payments.verify", {
    userId: Number(session.userId || 0),
  });
  const ip = getClientIp(request);

  try {
    const ipLimit = consumeRateLimit({
      key: `payments:verify:ip:${ip}`,
      limit: 75,
      windowMs: 15 * 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      logWarn("payments.verify_rate_limited_ip", {
        requestId: ctx.requestId,
        ip,
      });
      return rateLimitResponse(ipLimit.retryAfterMs);
    }

    const userLimit = consumeRateLimit({
      key: `payments:verify:user:${Number(session.userId || 0) || 0}`,
      limit: 60,
      windowMs: 15 * 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });
    if (!userLimit.allowed) {
      logWarn("payments.verify_rate_limited_user", {
        requestId: ctx.requestId,
        userId: Number(session.userId || 0) || null,
      });
      return rateLimitResponse(userLimit.retryAfterMs);
    }

    const payload = await parseRequestBody(request, verifySchema, {
      invalidJsonMessage: "Invalid payment verification payload",
    });

    const db = await readDB();
    const settlement = resolveSettlementContext(db, payload, session);
    const provider = String(payload.provider || "").toLowerCase();

    let verification = null;
    if (provider === "stripe") {
      verification = await verifyStripePayment(payload, settlement);
    } else if (provider === "paypal") {
      verification = await verifyPayPalPayment(payload, settlement);
    } else if (provider === "razorpay") {
      verification = await verifyRazorpayPayment(payload, settlement);
    } else {
      return NextResponse.json({ error: "Unsupported payment provider" }, { status: 400 });
    }

    logInfo("payments.verify_success", {
      requestId: ctx.requestId,
      userId: Number(session.userId || 0) || null,
      groupId: Number(settlement.group.id),
      provider,
      amount: Number(verification.amount || settlement.amount),
      currency: verification.currency,
      referenceId: verification.referenceId,
    });

    return NextResponse.json({
      success: true,
      verified: true,
      verification,
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

    if (code === "PAYMENT_PENDING") {
      return NextResponse.json(
        {
          error: "Payment is not completed yet.",
          retryable: true,
        },
        { status: 409 }
      );
    }

    if (code === "RAZORPAY_SIGNATURE_INVALID") {
      return NextResponse.json(
        { error: "Razorpay signature verification failed." },
        { status: 400 }
      );
    }
    if (code === "STRIPE_SESSION_REQUIRED") {
      return NextResponse.json({ error: "Stripe session id is required." }, { status: 400 });
    }
    if (code === "PAYPAL_ORDER_REQUIRED") {
      return NextResponse.json({ error: "PayPal order id is required." }, { status: 400 });
    }

    const notConfigured = providerNotConfiguredMessage(code);
    if (notConfigured) {
      return NextResponse.json({ error: notConfigured }, { status: 400 });
    }

    if (code.includes("_FAILED") || code.includes("_LOOKUP_FAILED")) {
      return NextResponse.json(
        { error: getProviderErrorMessage(error, "Payment provider verification failed") },
        { status: 502 }
      );
    }

    const errorId = newErrorId();
    const info = errorDetails(error, "Failed to verify payment");
    logError("payments.verify_failed", {
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
