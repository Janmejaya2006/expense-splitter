function asString(value) {
  return String(value || "").trim();
}

function masked(value) {
  const input = asString(value);
  if (!input) return "";
  if (input.length <= 8) return "*".repeat(input.length);
  return `${input.slice(0, 4)}...${input.slice(-4)}`;
}

function isPlaceholder(value) {
  const input = asString(value).toLowerCase();
  if (!input) return true;
  return [
    "changeme",
    "replace",
    "example",
    "your_real",
    "xxxxxxxxx",
    "any-long-random-string",
    "local-dev-secret-change-me",
  ].some((token) => input.includes(token));
}

function buildCheck({ key, label, status, message, required = true, meta = null }) {
  return {
    key,
    label,
    status,
    required,
    message,
    meta,
  };
}

export function getConfigHealth() {
  const checks = [];

  const authSecret = asString(process.env.AUTH_SECRET);
  const authReady = authSecret.length >= 32 && !isPlaceholder(authSecret);
  checks.push(
    buildCheck({
      key: "auth_secret",
      label: "Auth Secret",
      status: authReady ? "ok" : "fail",
      message: authReady
        ? "Configured"
        : "Set AUTH_SECRET to a long random value (32+ chars recommended).",
      required: true,
      meta: null,
    })
  );

  const dbBackend = asString(process.env.APP_DB_BACKEND || "sqlite").toLowerCase();
  const dbReady = ["sqlite", "json", "postgres"].includes(dbBackend);
  checks.push(
    buildCheck({
      key: "database_backend",
      label: "Database Backend",
      status: dbReady ? "ok" : "fail",
      message: dbReady ? `Using ${dbBackend}` : "APP_DB_BACKEND must be sqlite, json, or postgres.",
      required: true,
    })
  );

  const gmailUser = asString(process.env.GMAIL_USER);
  const gmailAppPassword = asString(process.env.GMAIL_APP_PASSWORD);
  const gmailReady = Boolean(
    gmailUser &&
      gmailAppPassword &&
      !isPlaceholder(gmailUser) &&
      !isPlaceholder(gmailAppPassword)
  );
  checks.push(
    buildCheck({
      key: "email_delivery",
      label: "Email Delivery",
      status: gmailReady ? "ok" : "warn",
      message: gmailReady
        ? `Ready (${masked(gmailUser)})`
        : "Set GMAIL_USER + GMAIL_APP_PASSWORD to enable verification and OTP emails.",
      required: false,
      meta: null,
    })
  );

  const authDefaultEnabled = process.env.NODE_ENV === "production" && gmailReady;
  const twoFactorRaw = asString(
    process.env.AUTH_2FA_ENABLED ?? (authDefaultEnabled ? "true" : "false")
  ).toLowerCase();
  const twoFactorRequested = !["0", "false", "off", "no"].includes(twoFactorRaw);
  const twoFactorEnabled = twoFactorRequested && gmailReady;
  checks.push(
    buildCheck({
      key: "auth_2fa",
      label: "Email OTP Login (2FA)",
      status: !twoFactorRequested || gmailReady ? "ok" : "warn",
      message: twoFactorRequested
        ? gmailReady
          ? "Enabled and email delivery is ready."
          : "Requested but auto-disabled because Gmail delivery is not configured."
        : "Disabled (AUTH_2FA_ENABLED=false).",
      required: false,
    })
  );

  const emailVerificationRaw = asString(
    process.env.AUTH_REQUIRE_EMAIL_VERIFICATION ?? (authDefaultEnabled ? "true" : "false")
  ).toLowerCase();
  const emailVerificationRequested = !["0", "false", "off", "no"].includes(emailVerificationRaw);
  const emailVerificationEnabled = emailVerificationRequested && gmailReady;
  checks.push(
    buildCheck({
      key: "auth_email_verification",
      label: "Email Verification",
      status: emailVerificationRequested ? (gmailReady ? "ok" : "warn") : "warn",
      message: emailVerificationRequested
        ? gmailReady
          ? "Enabled and verification emails can be delivered."
          : "Requested but auto-disabled because Gmail delivery is not configured."
        : "Disabled (AUTH_REQUIRE_EMAIL_VERIFICATION=false).",
      required: false,
    })
  );

  const twilioSid = asString(process.env.TWILIO_ACCOUNT_SID);
  const twilioToken = asString(process.env.TWILIO_AUTH_TOKEN);
  const twilioFrom = asString(process.env.TWILIO_FROM_PHONE);
  const smsReady = Boolean(twilioSid && twilioToken && twilioFrom);
  checks.push(
    buildCheck({
      key: "sms_delivery",
      label: "SMS Delivery",
      status: smsReady ? "ok" : "warn",
      message: smsReady
        ? "Ready"
        : "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE for SMS.",
      required: false,
    })
  );

  const whatsappFrom = asString(process.env.TWILIO_WHATSAPP_FROM);
  const whatsappReady = Boolean(twilioSid && twilioToken && (whatsappFrom || twilioFrom));
  checks.push(
    buildCheck({
      key: "whatsapp_delivery",
      label: "WhatsApp Delivery",
      status: whatsappReady ? "ok" : "warn",
      message: whatsappReady
        ? "Ready"
        : "Set TWILIO_WHATSAPP_FROM (or TWILIO_FROM_PHONE) for WhatsApp reminders.",
      required: false,
    })
  );

  const openAiKey = asString(process.env.OPENAI_API_KEY);
  const aiReady = openAiKey.startsWith("sk-") || openAiKey.startsWith("org-");
  checks.push(
    buildCheck({
      key: "ai_planner",
      label: "AI Planner Provider",
      status: aiReady ? "ok" : "warn",
      message: aiReady ? "OpenAI key configured" : "OPENAI_API_KEY missing. Local parser fallback stays active.",
      required: false,
    })
  );

  const googleClientId = asString(process.env.GOOGLE_OAUTH_CLIENT_ID);
  const googleClientSecret = asString(process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  const googleOAuthReady = Boolean(
    googleClientId &&
      googleClientSecret &&
      !isPlaceholder(googleClientId) &&
      !isPlaceholder(googleClientSecret)
  );
  checks.push(
    buildCheck({
      key: "google_oauth",
      label: "Google Sign-In",
      status: googleOAuthReady ? "ok" : "warn",
      message: googleOAuthReady
        ? "Google OAuth credentials configured."
        : "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to enable Google login.",
      required: false,
    })
  );

  const razorpayKeyId = asString(process.env.RAZORPAY_KEY_ID);
  const razorpayKeySecret = asString(process.env.RAZORPAY_KEY_SECRET);
  const razorpayReady = Boolean(
    razorpayKeyId &&
      razorpayKeySecret &&
      !isPlaceholder(razorpayKeyId) &&
      !isPlaceholder(razorpayKeySecret)
  );
  checks.push(
    buildCheck({
      key: "payment_razorpay",
      label: "Razorpay Payments",
      status: razorpayReady ? "ok" : "warn",
      message: razorpayReady
        ? "Razorpay credentials configured."
        : "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to enable Razorpay checkout.",
      required: false,
    })
  );

  const stripePublishableKey = asString(process.env.STRIPE_PUBLISHABLE_KEY);
  const stripeSecretKey = asString(process.env.STRIPE_SECRET_KEY);
  const stripeReady = Boolean(
    stripePublishableKey &&
      stripeSecretKey &&
      !isPlaceholder(stripePublishableKey) &&
      !isPlaceholder(stripeSecretKey)
  );
  checks.push(
    buildCheck({
      key: "payment_stripe",
      label: "Stripe Payments",
      status: stripeReady ? "ok" : "warn",
      message: stripeReady
        ? "Stripe keys configured."
        : "Set STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY to enable Stripe checkout.",
      required: false,
    })
  );

  const paypalClientId = asString(process.env.PAYPAL_CLIENT_ID);
  const paypalClientSecret = asString(process.env.PAYPAL_CLIENT_SECRET);
  const paypalReady = Boolean(
    paypalClientId &&
      paypalClientSecret &&
      !isPlaceholder(paypalClientId) &&
      !isPlaceholder(paypalClientSecret)
  );
  checks.push(
    buildCheck({
      key: "payment_paypal",
      label: "PayPal Payments",
      status: paypalReady ? "ok" : "warn",
      message: paypalReady
        ? "PayPal credentials configured."
        : "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to enable PayPal checkout.",
      required: false,
    })
  );

  const pushPublicKey = asString(process.env.WEB_PUSH_VAPID_PUBLIC_KEY);
  const pushPrivateKey = asString(process.env.WEB_PUSH_VAPID_PRIVATE_KEY);
  const pushSubject = asString(process.env.WEB_PUSH_VAPID_SUBJECT);
  const pushReady = Boolean(pushPublicKey && pushPrivateKey && pushSubject);
  checks.push(
    buildCheck({
      key: "web_push",
      label: "Web Push Notifications",
      status: pushReady ? "ok" : "warn",
      message: pushReady
        ? "Web Push configured"
        : "Set WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_VAPID_SUBJECT to enable push notifications.",
      required: false,
    })
  );

  const requiredChecks = checks.filter((item) => item.required);
  const failedRequired = requiredChecks.filter((item) => item.status === "fail");
  const okCount = checks.filter((item) => item.status === "ok").length;
  const warnCount = checks.filter((item) => item.status === "warn").length;
  const failCount = checks.filter((item) => item.status === "fail").length;
  const score = Math.round((okCount / Math.max(1, checks.length)) * 100);

  return {
    ok: failedRequired.length === 0,
    score,
    summary: failedRequired.length
      ? "Critical configuration missing."
      : warnCount
        ? "Core config is healthy, optional providers are missing."
        : "All major services are configured.",
    counts: {
      ok: okCount,
      warn: warnCount,
      fail: failCount,
      total: checks.length,
    },
    checks,
  };
}
