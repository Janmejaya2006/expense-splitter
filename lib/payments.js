import crypto from "node:crypto";

function safeText(value) {
  return String(value || "").trim();
}

function normalizeCurrencyCode(value, fallback = "USD") {
  const code = safeText(value).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : String(fallback || "USD").toUpperCase();
}

function toMinorAmount(amount, currency) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("INVALID_PAYMENT_AMOUNT");
  }

  const zeroDecimalCurrencies = new Set([
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

  if (zeroDecimalCurrencies.has(String(currency || "").toUpperCase())) {
    return Math.round(value);
  }

  return Math.round(value * 100);
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function encodeBasicAuth(username, password) {
  return Buffer.from(`${String(username || "")}:${String(password || "")}`).toString("base64");
}

function parseProviderErrorBody(body, fallback = "Payment provider request failed") {
  if (!body || typeof body !== "object") return fallback;
  const direct = safeText(body.error_description || body.error || body.message);
  if (direct) return direct;
  const nested = safeText(body?.error?.description || body?.error?.message);
  return nested || fallback;
}

function normalizeUpiId(value) {
  return safeText(value).toLowerCase();
}

function normalizeCardDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeCardCvc(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeCardholderName(value) {
  return safeText(value).replace(/\s+/g, " ").slice(0, 120);
}

function normalizeCardExpiryMonth(value) {
  const month = Number(value || 0);
  if (!Number.isFinite(month) || month < 1 || month > 12) return 0;
  return Math.floor(month);
}

function normalizeCardExpiryYear(value) {
  let year = Number(value || 0);
  if (!Number.isFinite(year) || year <= 0) return 0;
  if (year < 100) year += 2000;
  return Math.floor(year);
}

function isCardExpired(expMonth, expYear) {
  const month = normalizeCardExpiryMonth(expMonth);
  const year = normalizeCardExpiryYear(expYear);
  if (!month || !year) return true;
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  if (year < currentYear) return true;
  if (year === currentYear && month < currentMonth) return true;
  return false;
}

function isValidLuhn(digits) {
  const card = normalizeCardDigits(digits);
  if (card.length < 12 || card.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = card.length - 1; i >= 0; i -= 1) {
    let digit = Number(card[i] || 0);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

export function isValidUpiId(value) {
  const upi = normalizeUpiId(value);
  return /^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/i.test(upi);
}

export function maskUpiId(value) {
  const upi = normalizeUpiId(value);
  if (!upi.includes("@")) return upi;
  const [local, handle] = upi.split("@");
  if (!local || !handle) return upi;
  if (local.length <= 2) {
    return `${local[0] || "*"}*@${handle}`;
  }
  return `${local.slice(0, 2)}${"*".repeat(Math.max(1, local.length - 2))}@${handle}`;
}

export function getRazorpayConfig() {
  const keyId = safeText(process.env.RAZORPAY_KEY_ID);
  const keySecret = safeText(process.env.RAZORPAY_KEY_SECRET);
  return {
    ready: Boolean(keyId && keySecret),
    keyId,
    keySecret,
  };
}

export async function validateRazorpayUpiId(upiId) {
  const config = getRazorpayConfig();
  if (!config.ready) {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }

  const safeUpiId = normalizeUpiId(upiId);
  if (!isValidUpiId(safeUpiId)) {
    throw new Error("INVALID_UPI_ID");
  }

  const response = await fetch("https://api.razorpay.com/v1/payments/validate/vpa", {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeBasicAuth(config.keyId, config.keySecret)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ vpa: safeUpiId }),
    cache: "no-store",
  });

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      `RAZORPAY_UPI_VALIDATE_FAILED:${parseProviderErrorBody(body, "Could not verify UPI ID with Razorpay")}`
    );
  }

  const successRaw = body?.success;
  const success =
    successRaw === true ||
    String(successRaw || "")
      .trim()
      .toLowerCase() === "true";
  if (!success) {
    throw new Error("UPI_ID_NOT_VERIFIED");
  }

  return {
    verified: true,
    upiId: safeUpiId,
    customerName: safeText(body?.customer_name || body?.name),
    provider: "razorpay",
  };
}

export async function createRazorpayOrder({
  amount,
  currency = "INR",
  receipt = "",
  notes = {},
} = {}) {
  const config = getRazorpayConfig();
  if (!config.ready) {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }

  const paymentCurrency = normalizeCurrencyCode(currency, "INR");
  const minorAmount = toMinorAmount(amount, paymentCurrency);

  const payload = {
    amount: minorAmount,
    currency: paymentCurrency,
    receipt: safeText(receipt).slice(0, 40) || `settle_${Date.now()}`,
    notes: notes && typeof notes === "object" ? notes : {},
  };

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeBasicAuth(config.keyId, config.keySecret)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(`RAZORPAY_ORDER_FAILED:${parseProviderErrorBody(body, "Could not create Razorpay order")}`);
  }

  return {
    orderId: safeText(body.id),
    amount: Number(body.amount || minorAmount),
    currency: safeText(body.currency || paymentCurrency) || paymentCurrency,
    keyId: config.keyId,
  };
}

export function verifyRazorpayPaymentSignature({ orderId, paymentId, signature } = {}) {
  const config = getRazorpayConfig();
  if (!config.ready) {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }

  const safeOrderId = safeText(orderId);
  const safePaymentId = safeText(paymentId);
  const safeSignature = safeText(signature);
  if (!safeOrderId || !safePaymentId || !safeSignature) {
    throw new Error("RAZORPAY_SIGNATURE_INVALID");
  }

  const expected = crypto
    .createHmac("sha256", config.keySecret)
    .update(`${safeOrderId}|${safePaymentId}`)
    .digest("hex");

  const left = Buffer.from(expected);
  const right = Buffer.from(safeSignature.toLowerCase());
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function getStripeConfig() {
  const secretKey = safeText(process.env.STRIPE_SECRET_KEY);
  const publishableKey = safeText(process.env.STRIPE_PUBLISHABLE_KEY);
  return {
    ready: Boolean(secretKey && publishableKey),
    secretKey,
    publishableKey,
  };
}

export async function verifyStripeCardDetails({
  cardNumber,
  expMonth,
  expYear,
  cvc,
  cardholderName = "",
} = {}) {
  const config = getStripeConfig();
  if (!config.ready) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  const digits = normalizeCardDigits(cardNumber);
  const month = normalizeCardExpiryMonth(expMonth);
  const year = normalizeCardExpiryYear(expYear);
  const safeCvc = normalizeCardCvc(cvc);
  const safeName = normalizeCardholderName(cardholderName);

  if (!isValidLuhn(digits)) {
    throw new Error("INVALID_CARD_NUMBER");
  }
  if (!month || !year || isCardExpired(month, year)) {
    throw new Error("INVALID_CARD_EXPIRY");
  }
  if (!/^\d{3,4}$/.test(safeCvc)) {
    throw new Error("INVALID_CARD_CVC");
  }

  const payload = stripeFormEncode({
    type: "card",
    "card[number]": digits,
    "card[exp_month]": month,
    "card[exp_year]": year,
    "card[cvc]": safeCvc,
    "billing_details[name]": safeName || undefined,
  });

  const response = await fetch("https://api.stripe.com/v1/payment_methods", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
    cache: "no-store",
  });

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(
      `STRIPE_CARD_VERIFY_FAILED:${parseProviderErrorBody(body, "Could not verify card with Stripe")}`
    );
  }

  const paymentMethodId = safeText(body?.id);
  if (!paymentMethodId) {
    throw new Error("STRIPE_CARD_VERIFY_FAILED:Stripe did not return payment method id");
  }

  const card = body?.card && typeof body.card === "object" ? body.card : {};
  return {
    verified: true,
    provider: "stripe",
    paymentMethodId,
    brand: safeText(card.brand).toLowerCase(),
    last4: safeText(card.last4),
    expMonth: Number(card.exp_month || month),
    expYear: Number(card.exp_year || year),
    funding: safeText(card.funding).toLowerCase(),
    country: safeText(card.country).toUpperCase(),
    fingerprint: safeText(card.fingerprint),
  };
}

function stripeFormEncode(payload) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  return params;
}

export async function createStripeCheckoutSession({
  amount,
  currency = "USD",
  description = "Settlement payment",
  successUrl,
  cancelUrl,
  metadata = {},
} = {}) {
  const config = getStripeConfig();
  if (!config.ready) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }

  const paymentCurrency = normalizeCurrencyCode(currency, "USD").toLowerCase();
  const minorAmount = toMinorAmount(amount, paymentCurrency);
  const safeSuccessUrl = safeText(successUrl);
  const safeCancelUrl = safeText(cancelUrl);
  if (!safeSuccessUrl || !safeCancelUrl) {
    throw new Error("STRIPE_URLS_REQUIRED");
  }

  const payload = stripeFormEncode({
    mode: "payment",
    "line_items[0][price_data][currency]": paymentCurrency,
    "line_items[0][price_data][unit_amount]": minorAmount,
    "line_items[0][price_data][product_data][name]": safeText(description) || "Settlement payment",
    "line_items[0][quantity]": 1,
    success_url: safeSuccessUrl,
    cancel_url: safeCancelUrl,
  });

  for (const [key, value] of Object.entries(metadata || {})) {
    const safeKey = safeText(key).slice(0, 40);
    if (!safeKey) continue;
    payload.append(`metadata[${safeKey}]`, safeText(value).slice(0, 500));
  }

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
    cache: "no-store",
  });

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(`STRIPE_SESSION_FAILED:${parseProviderErrorBody(body, "Could not create Stripe checkout session")}`);
  }

  return {
    sessionId: safeText(body.id),
    url: safeText(body.url),
    publishableKey: config.publishableKey,
  };
}

export async function retrieveStripeCheckoutSession(sessionId) {
  const config = getStripeConfig();
  if (!config.ready) {
    throw new Error("STRIPE_NOT_CONFIGURED");
  }
  const safeSessionId = safeText(sessionId);
  if (!safeSessionId) {
    throw new Error("STRIPE_SESSION_REQUIRED");
  }

  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(safeSessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
      },
      cache: "no-store",
    }
  );

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(`STRIPE_SESSION_LOOKUP_FAILED:${parseProviderErrorBody(body, "Could not verify Stripe session")}`);
  }

  return body;
}

export function getPayPalConfig() {
  const clientId = safeText(process.env.PAYPAL_CLIENT_ID);
  const clientSecret = safeText(process.env.PAYPAL_CLIENT_SECRET);
  const env = safeText(process.env.PAYPAL_ENV || "sandbox").toLowerCase();
  const baseUrl = env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  return {
    ready: Boolean(clientId && clientSecret),
    clientId,
    clientSecret,
    baseUrl,
    env,
  };
}

async function getPayPalAccessToken(config) {
  const response = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${encodeBasicAuth(config.clientId, config.clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(`PAYPAL_TOKEN_FAILED:${parseProviderErrorBody(body, "Could not authenticate with PayPal")}`);
  }

  const token = safeText(body.access_token);
  if (!token) {
    throw new Error("PAYPAL_TOKEN_MISSING");
  }
  return token;
}

export async function createPayPalOrder({
  amount,
  currency = "USD",
  description = "Settlement payment",
  returnUrl,
  cancelUrl,
} = {}) {
  const config = getPayPalConfig();
  if (!config.ready) {
    throw new Error("PAYPAL_NOT_CONFIGURED");
  }

  const paymentCurrency = normalizeCurrencyCode(currency, "USD");
  const fixedAmount = Number(amount || 0).toFixed(2);
  const token = await getPayPalAccessToken(config);

  const response = await fetch(`${config.baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: paymentCurrency,
            value: fixedAmount,
          },
          description: safeText(description).slice(0, 127) || "Settlement payment",
        },
      ],
      application_context: {
        user_action: "PAY_NOW",
        return_url: safeText(returnUrl) || undefined,
        cancel_url: safeText(cancelUrl) || undefined,
      },
    }),
    cache: "no-store",
  });

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(`PAYPAL_ORDER_FAILED:${parseProviderErrorBody(body, "Could not create PayPal order")}`);
  }

  const approveUrl = Array.isArray(body.links)
    ? safeText(body.links.find((item) => safeText(item?.rel).toLowerCase() === "approve")?.href)
    : "";

  return {
    orderId: safeText(body.id),
    status: safeText(body.status),
    approveUrl,
    clientId: config.clientId,
    env: config.env,
  };
}

export async function capturePayPalOrder(orderId) {
  const config = getPayPalConfig();
  if (!config.ready) {
    throw new Error("PAYPAL_NOT_CONFIGURED");
  }
  const safeOrderId = safeText(orderId);
  if (!safeOrderId) {
    throw new Error("PAYPAL_ORDER_REQUIRED");
  }

  const token = await getPayPalAccessToken(config);
  const response = await fetch(
    `${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(safeOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
    }
  );

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    const message = parseProviderErrorBody(body, "Could not capture PayPal payment");
    if (String(message).toLowerCase().includes("order already captured")) {
      return { alreadyCaptured: true, body };
    }
    throw new Error(`PAYPAL_CAPTURE_FAILED:${message}`);
  }

  return { alreadyCaptured: false, body };
}

export async function getPayPalOrder(orderId) {
  const config = getPayPalConfig();
  if (!config.ready) {
    throw new Error("PAYPAL_NOT_CONFIGURED");
  }

  const safeOrderId = safeText(orderId);
  if (!safeOrderId) {
    throw new Error("PAYPAL_ORDER_REQUIRED");
  }

  const token = await getPayPalAccessToken(config);
  const response = await fetch(
    `${config.baseUrl}/v2/checkout/orders/${encodeURIComponent(safeOrderId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    }
  );

  const body = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(`PAYPAL_ORDER_LOOKUP_FAILED:${parseProviderErrorBody(body, "Could not verify PayPal order")}`);
  }

  return body;
}
