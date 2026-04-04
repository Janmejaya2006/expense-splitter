import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { consumeRateLimit, getClientIp } from "@/lib/rateLimit";
import { readDB, updateDB } from "@/lib/store";
import {
  isValidUpiId,
  maskUpiId,
  validateRazorpayUpiId,
  verifyStripeCardDetails,
} from "@/lib/payments";
import { createRequestContext, errorDetails, logError, logInfo, logWarn, newErrorId } from "@/lib/logger";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

const createPaymentMethodSchema = z
  .object({
    type: z.enum(["upi", "card"]),
    upiId: z.string().trim().max(320).optional().default(""),
    card: z
      .object({
        number: z.string().trim().min(12, "Card number is required").max(32),
        expMonth: z.coerce.number().int().min(1).max(12),
        expYear: z.coerce.number().int().min(2000).max(2100),
        cvc: z.string().trim().min(3).max(4),
        holderName: z.string().trim().max(120).optional().default(""),
      })
      .optional()
      .nullable(),
  })
  .refine(
    (payload) => {
      if (payload.type === "upi") {
        return Boolean(payload.upiId && isValidUpiId(payload.upiId));
      }
      return Boolean(payload.card?.number && payload.card?.expMonth && payload.card?.expYear && payload.card?.cvc);
    },
    {
      message: "Invalid payment method payload",
    }
  );

function rateLimitResponse(retryAfterMs) {
  const seconds = Math.max(1, Math.ceil(Number(retryAfterMs || 0) / 1000));
  return NextResponse.json(
    { error: "Too many payment method requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(seconds),
      },
    }
  );
}

function toPublicPaymentMethod(method) {
  return {
    id: String(method?.id || ""),
    type: String(method?.type || ""),
    name: String(method?.name || ""),
    account: String(method?.accountMask || ""),
    provider: String(method?.provider || ""),
    connected: method?.active !== false,
    verificationStatus: String(method?.verificationStatus || "verified"),
    verifiedAt: String(method?.verifiedAt || ""),
    createdAt: String(method?.createdAt || ""),
  };
}

function cardMaskLabel({ brand = "", last4 = "", expMonth = 0, expYear = 0 } = {}) {
  const safeBrand = String(brand || "").trim();
  const safeLast4 = String(last4 || "")
    .trim()
    .slice(-4);
  const month = Number(expMonth || 0);
  const year = Number(expYear || 0);
  const exp = month > 0 && year > 0 ? ` (exp ${String(month).padStart(2, "0")}/${String(year).slice(-2)})` : "";
  const prefix = safeBrand ? `${safeBrand[0].toUpperCase()}${safeBrand.slice(1)} ` : "";
  return `${prefix}**** **** **** ${safeLast4}${exp}`.trim();
}

function mapCreateError(error) {
  const code = String(error?.message || "").trim();
  if (
    code === "INVALID_UPI_ID" ||
    code === "UPI_ID_NOT_VERIFIED" ||
    code === "INVALID_CARD_NUMBER" ||
    code === "INVALID_CARD_EXPIRY" ||
    code === "INVALID_CARD_CVC"
  ) {
    return { status: 400, message: "Invalid payment details." };
  }
  if (code.startsWith("RAZORPAY_UPI_VALIDATE_FAILED:")) {
    return {
      status: 400,
      message: code.slice(code.indexOf(":") + 1).trim() || "UPI ID verification failed.",
    };
  }
  if (code.startsWith("STRIPE_CARD_VERIFY_FAILED:")) {
    return {
      status: 400,
      message: code.slice(code.indexOf(":") + 1).trim() || "Card verification failed.",
    };
  }
  if (code === "RAZORPAY_NOT_CONFIGURED") {
    return { status: 503, message: "UPI verification provider is not configured." };
  }
  if (code === "STRIPE_NOT_CONFIGURED") {
    return { status: 503, message: "Card verification provider is not configured." };
  }
  if (code === "PAYMENT_METHOD_EXISTS") {
    return { status: 409, message: "This payment method is already connected." };
  }
  return null;
}

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  const ctx = createRequestContext(request, "payments.methods.list", {
    userId: Number(session.userId || 0),
  });
  try {
    const db = await readDB();
    const methods = (db.paymentMethods || [])
      .filter((item) => Number(item.userId) === Number(session.userId) && item.active !== false)
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
      .map(toPublicPaymentMethod);

    return NextResponse.json({ methods });
  } catch (error) {
    const errorId = newErrorId();
    const details = errorDetails(error, "Failed to load payment methods");
    logError("payments.methods.list_failed", {
      requestId: ctx.requestId,
      errorId,
      userId: Number(session.userId || 0) || null,
      message: details.message,
      stack: details.stack,
    });
    return NextResponse.json({ error: "Failed to load payment methods", errorId }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  const ctx = createRequestContext(request, "payments.methods.create", {
    userId: Number(session.userId || 0),
  });
  const ip = getClientIp(request);

  try {
    const ipLimit = consumeRateLimit({
      key: `payments:methods:create:ip:${ip}`,
      limit: 25,
      windowMs: 15 * 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });
    if (!ipLimit.allowed) {
      logWarn("payments.methods.create_rate_limited_ip", {
        requestId: ctx.requestId,
        ip,
      });
      return rateLimitResponse(ipLimit.retryAfterMs);
    }

    const userLimit = consumeRateLimit({
      key: `payments:methods:create:user:${Number(session.userId || 0) || 0}`,
      limit: 18,
      windowMs: 15 * 60 * 1000,
      blockDurationMs: 5 * 60 * 1000,
    });
    if (!userLimit.allowed) {
      logWarn("payments.methods.create_rate_limited_user", {
        requestId: ctx.requestId,
        userId: Number(session.userId || 0) || null,
      });
      return rateLimitResponse(userLimit.retryAfterMs);
    }

    const payload = await parseRequestBody(request, createPaymentMethodSchema, {
      invalidJsonMessage: "Invalid payment method payload",
    });

    const type = String(payload.type || "").toLowerCase();
    const now = new Date().toISOString();
    let nextRecord = null;

    if (type === "upi") {
      const upiVerification = await validateRazorpayUpiId(payload.upiId);
      const upiId = String(upiVerification.upiId || "").trim().toLowerCase();

      await updateDB((draft) => {
        const existing = (draft.paymentMethods || []).find(
          (item) =>
            Number(item.userId) === Number(session.userId) &&
            String(item.type || "").toLowerCase() === "upi" &&
            String(item.upiId || "").toLowerCase() === upiId
        );

        if (existing && existing.active !== false) {
          throw new Error("PAYMENT_METHOD_EXISTS");
        }

        if (existing) {
          existing.active = true;
          existing.provider = "razorpay";
          existing.name = "UPI";
          existing.accountMask = maskUpiId(upiId);
          existing.upiId = upiId;
          existing.verifiedAt = now;
          existing.verificationStatus = "verified";
          existing.updatedAt = now;
          nextRecord = { ...existing };
          return draft;
        }

        const id = Number(draft.meta.nextPaymentMethodId);
        draft.meta.nextPaymentMethodId += 1;
        const record = {
          id,
          userId: Number(session.userId),
          type: "upi",
          provider: "razorpay",
          name: "UPI",
          accountMask: maskUpiId(upiId),
          upiId,
          stripePaymentMethodId: "",
          cardBrand: "",
          cardLast4: "",
          cardExpMonth: null,
          cardExpYear: null,
          cardFingerprint: "",
          verifiedAt: now,
          verificationStatus: "verified",
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        draft.paymentMethods.push(record);
        nextRecord = { ...record };
        return draft;
      });

      const method = toPublicPaymentMethod(nextRecord);
      logInfo("payments.methods.create_success_upi", {
        requestId: ctx.requestId,
        userId: Number(session.userId || 0) || null,
        methodId: Number(nextRecord?.id || 0) || null,
      });
      return NextResponse.json({ success: true, method });
    }

    const card = payload.card || {};
    const cardVerification = await verifyStripeCardDetails({
      cardNumber: card.number,
      expMonth: card.expMonth,
      expYear: card.expYear,
      cvc: card.cvc,
      cardholderName: card.holderName || "",
    });

    const fingerprint = String(cardVerification.fingerprint || "").trim();
    const cardLast4 = String(cardVerification.last4 || "").trim();
    const cardBrand = String(cardVerification.brand || "").trim().toLowerCase();
    const cardExpMonth = Number(cardVerification.expMonth || 0);
    const cardExpYear = Number(cardVerification.expYear || 0);

    await updateDB((draft) => {
      const existing = (draft.paymentMethods || []).find((item) => {
        if (Number(item.userId) !== Number(session.userId)) return false;
        if (String(item.type || "").toLowerCase() !== "card") return false;
        if (fingerprint && String(item.cardFingerprint || "").trim() === fingerprint) return true;
        return (
          String(item.cardLast4 || "").trim() === cardLast4 &&
          Number(item.cardExpMonth || 0) === cardExpMonth &&
          Number(item.cardExpYear || 0) === cardExpYear
        );
      });

      if (existing && existing.active !== false) {
        throw new Error("PAYMENT_METHOD_EXISTS");
      }

      if (existing) {
        existing.active = true;
        existing.provider = "stripe";
        existing.name = "Credit / Debit Card";
        existing.accountMask = cardMaskLabel({
          brand: cardBrand,
          last4: cardLast4,
          expMonth: cardExpMonth,
          expYear: cardExpYear,
        });
        existing.stripePaymentMethodId = String(cardVerification.paymentMethodId || "");
        existing.cardBrand = cardBrand;
        existing.cardLast4 = cardLast4;
        existing.cardExpMonth = cardExpMonth;
        existing.cardExpYear = cardExpYear;
        existing.cardFingerprint = fingerprint;
        existing.verifiedAt = now;
        existing.verificationStatus = "verified";
        existing.updatedAt = now;
        nextRecord = { ...existing };
        return draft;
      }

      const id = Number(draft.meta.nextPaymentMethodId);
      draft.meta.nextPaymentMethodId += 1;
      const record = {
        id,
        userId: Number(session.userId),
        type: "card",
        provider: "stripe",
        name: "Credit / Debit Card",
        accountMask: cardMaskLabel({
          brand: cardBrand,
          last4: cardLast4,
          expMonth: cardExpMonth,
          expYear: cardExpYear,
        }),
        upiId: "",
        stripePaymentMethodId: String(cardVerification.paymentMethodId || ""),
        cardBrand,
        cardLast4,
        cardExpMonth,
        cardExpYear,
        cardFingerprint: fingerprint,
        verifiedAt: now,
        verificationStatus: "verified",
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      draft.paymentMethods.push(record);
      nextRecord = { ...record };
      return draft;
    });

    const method = toPublicPaymentMethod(nextRecord);
    logInfo("payments.methods.create_success_card", {
      requestId: ctx.requestId,
      userId: Number(session.userId || 0) || null,
      methodId: Number(nextRecord?.id || 0) || null,
    });
    return NextResponse.json({ success: true, method });
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;

    const mapped = mapCreateError(error);
    if (mapped) {
      return NextResponse.json({ error: mapped.message }, { status: mapped.status });
    }

    const errorId = newErrorId();
    const details = errorDetails(error, "Failed to create payment method");
    logError("payments.methods.create_failed", {
      requestId: ctx.requestId,
      errorId,
      userId: Number(session.userId || 0) || null,
      ip,
      message: details.message,
      stack: details.stack,
    });
    return NextResponse.json({ error: "Failed to create payment method", errorId }, { status: 500 });
  }
}
