function asString(value) {
  return String(value || "").trim();
}

function normalizePhone(value) {
  return asString(value).replace(/[()\s-]/g, "");
}

export function formatCurrency(amount, currency = "INR") {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: String(currency || "INR").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(Number(amount || 0));
  } catch {
    return `${String(currency || "INR").toUpperCase()} ${Number(amount || 0).toFixed(2)}`;
  }
}

// ─── Gmail SMTP via Nodemailer ─────────────────────────────────────────────────

async function sendGmailEmail({ toEmail, subject, text, errorMessage, successMessage }) {
  const nodemailer = await import("nodemailer");

  const gmailUser = asString(process.env.GMAIL_USER);
  const gmailPass = asString(process.env.GMAIL_APP_PASSWORD);

  if (!gmailUser || !gmailPass) {
    throw new Error(
      "Gmail SMTP is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env.local."
    );
  }

  const transporter = nodemailer.default.createTransport({
    service: "gmail",
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"Expense Split" <${gmailUser}>`,
      to: toEmail,
      subject,
      text,
    });

    return {
      provider: "gmail",
      id: info.messageId || null,
      message: successMessage,
    };
  } catch (err) {
    throw new Error(err.message || errorMessage);
  }
}

// ─── Settlement Email ──────────────────────────────────────────────────────────

export async function sendSettlementEmail({ toEmail, fromName, toName, amount, currency, groupName, customMessage }) {
  if (!toEmail) {
    throw new Error("Recipient email is missing");
  }

  const amountText = formatCurrency(amount, currency);
  const summary = `${fromName}, please settle ${amountText} with ${toName} for "${groupName}".`;
  const text = customMessage ? `${customMessage}\n\n${summary}` : summary;

  return sendGmailEmail({
    toEmail,
    subject: `Settlement reminder for ${groupName}`,
    text,
    errorMessage: "Failed to send settlement email",
    successMessage: "Email sent successfully",
  });
}

// ─── Twilio SMS/WhatsApp ───────────────────────────────────────────────────────

async function sendTwilioMessage({ to, from, bodyText, accountSid, authToken, fallbackError }) {
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const formBody = new URLSearchParams({
    To: to,
    From: from,
    Body: bodyText,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.message || fallbackError);
  }

  return {
    provider: "twilio",
    id: body?.sid || null,
    message: "Message sent successfully",
  };
}

export async function sendSettlementSms({ toPhone, fromName, toName, amount, currency, groupName, customMessage }) {
  const accountSid = asString(process.env.TWILIO_ACCOUNT_SID);
  const authToken = asString(process.env.TWILIO_AUTH_TOKEN);
  const fromPhone = normalizePhone(process.env.TWILIO_FROM_PHONE);
  const targetPhone = normalizePhone(toPhone);

  if (!targetPhone) {
    throw new Error("Recipient contact number is missing");
  }

  if (!accountSid || !authToken || !fromPhone) {
    throw new Error("SMS service is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_PHONE.");
  }

  const amountText = formatCurrency(amount, currency);
  const summary = `${fromName}, please settle ${amountText} with ${toName} for ${groupName}.`;
  const bodyText = customMessage ? `${customMessage}\n${summary}` : summary;

  const result = await sendTwilioMessage({
    to: targetPhone,
    from: fromPhone,
    bodyText,
    accountSid,
    authToken,
    fallbackError: "Failed to send settlement SMS",
  });

  return { ...result, message: "Text message sent successfully" };
}

export async function sendSettlementWhatsapp({ toPhone, fromName, toName, amount, currency, groupName, customMessage }) {
  const accountSid = asString(process.env.TWILIO_ACCOUNT_SID);
  const authToken = asString(process.env.TWILIO_AUTH_TOKEN);
  const fromWhatsappRaw = asString(process.env.TWILIO_WHATSAPP_FROM) || asString(process.env.TWILIO_FROM_PHONE);
  const fromWhatsapp = fromWhatsappRaw.startsWith("whatsapp:")
    ? fromWhatsappRaw
    : `whatsapp:${normalizePhone(fromWhatsappRaw)}`;

  const targetPhone = normalizePhone(toPhone);
  const targetWhatsapp = targetPhone.startsWith("whatsapp:") ? targetPhone : `whatsapp:${targetPhone}`;

  if (!targetPhone) {
    throw new Error("Recipient contact number is missing");
  }

  if (!accountSid || !authToken || !fromWhatsappRaw) {
    throw new Error(
      "WhatsApp service is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM (or TWILIO_FROM_PHONE)."
    );
  }

  const amountText = formatCurrency(amount, currency);
  const summary = `${fromName}, please settle ${amountText} with ${toName} for ${groupName}.`;
  const bodyText = customMessage ? `${customMessage}\n${summary}` : summary;

  const result = await sendTwilioMessage({
    to: targetWhatsapp,
    from: fromWhatsapp,
    bodyText,
    accountSid,
    authToken,
    fallbackError: "Failed to send settlement WhatsApp message",
  });

  return { ...result, message: "WhatsApp message sent successfully" };
}

// ─── Group Invite Email ────────────────────────────────────────────────────────

export async function sendGroupInviteEmail({
  toEmail,
  groupName,
  inviterName,
  inviteLink,
  role = "member",
}) {
  if (!toEmail) {
    throw new Error("Recipient email is missing");
  }

  const text = `${inviterName || "A teammate"} invited you as ${role} to join "${groupName}" on Expense Split.\n\nJoin link: ${inviteLink}`;

  return sendGmailEmail({
    toEmail,
    subject: `Invitation to join ${groupName}`,
    text,
    errorMessage: "Failed to send invite email",
    successMessage: "Invite email sent successfully",
  });
}

// ─── Password Reset Email ──────────────────────────────────────────────────────

export async function sendPasswordResetEmail({ toEmail, resetLink }) {
  if (!toEmail) {
    throw new Error("Recipient email is missing");
  }

  const text = `We received a request to reset your Expense Split password.\n\nReset link: ${resetLink}\n\nIf you did not request this, you can ignore this email.`;

  return sendGmailEmail({
    toEmail,
    subject: "Reset your Expense Split password",
    text,
    errorMessage: "Failed to send password reset email",
    successMessage: "Password reset email sent successfully",
  });
}

// ─── Email Verification ────────────────────────────────────────────────────────

export async function sendEmailVerificationEmail({ toEmail, verifyLink }) {
  if (!toEmail) {
    throw new Error("Recipient email is missing");
  }

  const text = `Welcome to Expense Split.\n\nPlease verify your email using this link:\n${verifyLink}\n\nIf you did not create this account, you can ignore this email.`;

  return sendGmailEmail({
    toEmail,
    subject: "Verify your Expense Split email",
    text,
    errorMessage: "Failed to send email verification link",
    successMessage: "Email verification link sent successfully",
  });
}

// ─── Login OTP Email ───────────────────────────────────────────────────────────

export async function sendLoginOtpEmail({ toEmail, otpCode, expiresAt }) {
  if (!toEmail) {
    throw new Error("Recipient email is missing");
  }

  const expiresMs = new Date(expiresAt || "").getTime();
  const mins = Number.isFinite(expiresMs)
    ? Math.max(1, Math.ceil((expiresMs - Date.now()) / (1000 * 60)))
    : 10;

  const safeOtp = String(otpCode || "").trim();
  if (!safeOtp) {
    throw new Error("OTP code is missing");
  }

  const text = `Your Expense Split login verification code is: ${safeOtp}\n\nThis code expires in about ${mins} minute(s).\n\nIf you did not request this login, you can ignore this email.`;

  return sendGmailEmail({
    toEmail,
    subject: "Your Expense Split login verification code",
    text,
    errorMessage: "Failed to send login OTP email",
    successMessage: "Login OTP email sent successfully",
  });
}

// ─── Monthly Summary Email ─────────────────────────────────────────────────────

export async function sendMonthlySummaryEmail({
  toEmail,
  recipientName,
  groupName,
  monthLabel,
  currency,
  totalSpent,
  expenseCount,
  settledAmount,
  pendingSettlementCount,
  topCategories = [],
  insightLines = [],
}) {
  if (!toEmail) {
    throw new Error("Recipient email is missing");
  }

  const lines = [];
  lines.push(`Hi ${recipientName || "there"},`);
  lines.push("");
  lines.push(`Here is your monthly summary for "${groupName}" (${monthLabel}).`);
  lines.push("");
  lines.push(`Total spent: ${formatCurrency(totalSpent, currency)}`);
  lines.push(`Expenses recorded: ${Number(expenseCount || 0)}`);
  lines.push(`Settled amount: ${formatCurrency(settledAmount, currency)}`);
  lines.push(`Pending settlements: ${Number(pendingSettlementCount || 0)}`);
  lines.push("");

  if (topCategories.length) {
    lines.push("Top categories:");
    for (const category of topCategories.slice(0, 5)) {
      lines.push(`  - ${category.category}: ${formatCurrency(category.amount, currency)}`);
    }
    lines.push("");
  }

  if (insightLines.length) {
    lines.push("Insights:");
    for (const line of insightLines.slice(0, 5)) {
      lines.push(`  - ${line}`);
    }
    lines.push("");
  }

  lines.push("Open Expense Split to review details and settle up.");

  return sendGmailEmail({
    toEmail,
    subject: `Monthly summary • ${groupName} • ${monthLabel}`,
    text: lines.join("\n"),
    errorMessage: "Failed to send monthly summary email",
    successMessage: "Monthly summary email sent successfully",
  });
}
