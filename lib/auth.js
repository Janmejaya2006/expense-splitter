import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { nowISO, readDB, updateDB } from "@/lib/store";

export const SESSION_COOKIE_NAME = "expense_split_session";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;
const PASSWORD_RESET_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const EMAIL_VERIFICATION_RETENTION_MS = 1000 * 60 * 60 * 24 * 7;
const LOGIN_OTP_TTL_MS = 1000 * 60 * 10;
const LOGIN_OTP_MAX_ATTEMPTS = 5;
const LOGIN_OTP_RETENTION_MS = 1000 * 60 * 60 * 24 * 3;
const AUTH_SECRET_MIN_LENGTH = 32;
const PASSWORD_SCHEME = "scrypt";
const PASSWORD_KEYLEN = 64;
const DEV_FALLBACK_AUTH_SECRET = crypto.randomBytes(48).toString("base64url");

function safeCompare(valueA, valueB) {
  const a = Buffer.from(String(valueA || ""));
  const b = Buffer.from(String(valueB || ""));

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getAuthSecret() {
  const configured = String(process.env.AUTH_SECRET || "").trim();
  if (configured.length >= AUTH_SECRET_MIN_LENGTH) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET_MISSING");
  }

  return DEV_FALLBACK_AUTH_SECRET;
}

function signPayload(payload) {
  return crypto.createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isEmailVerified(user) {
  return Boolean(String(user?.emailVerifiedAt || "").trim());
}

function envToggleOrDefault(value, defaultEnabled) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return Boolean(defaultEnabled);
  return !["0", "false", "off", "no"].includes(raw);
}

export function isEmailVerificationRequired() {
  const defaultEnabled = process.env.NODE_ENV === "production";
  return envToggleOrDefault(process.env.AUTH_REQUIRE_EMAIL_VERIFICATION, defaultEnabled);
}

function passwordPayloadHash(password, salt) {
  return crypto.scryptSync(String(password || ""), salt, PASSWORD_KEYLEN).toString("base64url");
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = passwordPayloadHash(password, salt);
  return `${PASSWORD_SCHEME}$${salt}$${hash}`;
}

export function verifyPassword(password, storedHash) {
  const value = String(storedHash || "");
  const [scheme, salt, stored] = value.split("$");
  if (!scheme || !salt || !stored) return false;
  if (scheme !== PASSWORD_SCHEME) return false;

  const computed = passwordPayloadHash(password, salt);
  return safeCompare(computed, stored);
}

export function validatePasswordStrength(password) {
  const value = String(password || "");

  if (value.length < 8) {
    return "Password must be at least 8 characters long";
  }

  if (!/[a-z]/i.test(value) || !/[0-9]/.test(value)) {
    return "Password must include letters and numbers";
  }

  return "";
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    name: String(user.name || "").trim(),
    email: normalizeEmail(user.email),
    phone: String(user.phone || "").trim(),
    avatarUrl: String(user.avatarUrl || "").trim(),
    emailVerified: Boolean(user.emailVerifiedAt),
    emailVerifiedAt: user.emailVerifiedAt ? String(user.emailVerifiedAt) : null,
    notificationPreferences: {
      email: user.notificationPreferences?.email !== false,
      sms: Boolean(user.notificationPreferences?.sms),
      whatsapp: Boolean(user.notificationPreferences?.whatsapp),
      productUpdates: user.notificationPreferences?.productUpdates !== false,
      settlementAlerts: user.notificationPreferences?.settlementAlerts !== false,
      weeklySummary: user.notificationPreferences?.weeklySummary !== false,
    },
    createdAt: String(user.createdAt || ""),
    lastLoginAt: user.lastLoginAt || null,
  };
}

function nameFromEmail(email) {
  const normalized = normalizeEmail(email);
  const local = normalized.split("@")[0] || "User";
  const cleaned = String(local || "").replace(/[._-]+/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (char) => char.toUpperCase()) : "User";
}

export async function registerUser({ name, email, password, phone = "" }) {
  const cleanName = String(name || "").trim();
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");
  const cleanPhone = String(phone || "").trim();

  if (!cleanName) {
    throw new Error("NAME_REQUIRED");
  }

  if (!cleanEmail) {
    throw new Error("EMAIL_REQUIRED");
  }

  const passwordError = validatePasswordStrength(cleanPassword);
  if (passwordError) {
    throw new Error(passwordError);
  }

  let created = null;

  await updateDB((draft) => {
    const exists = draft.users.some((item) => normalizeEmail(item.email) === cleanEmail);
    if (exists) throw new Error("EMAIL_EXISTS");

    const id = Number(draft.meta.nextUserId);
    draft.meta.nextUserId += 1;

    created = {
      id,
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      avatarUrl: "",
      passwordHash: hashPassword(cleanPassword),
      notificationPreferences: {
        email: true,
        sms: false,
        whatsapp: false,
        productUpdates: true,
        settlementAlerts: true,
        weeklySummary: true,
      },
      createdAt: nowISO(),
      lastLoginAt: null,
      emailVerifiedAt: isEmailVerificationRequired() ? null : nowISO(),
      emailVerificationSentAt: null,
    };

    draft.users.push(created);

    for (const member of draft.members || []) {
      const memberEmail = normalizeEmail(member.email);
      if (memberEmail && memberEmail === cleanEmail) {
        member.userId = id;
      }
    }

    return draft;
  });

  return publicUser(created);
}

export async function authenticateUser(email, password) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) return null;

  const db = await readDB();
  const user = db.users.find((item) => normalizeEmail(item.email) === cleanEmail);
  if (!user) return null;

  const valid = verifyPassword(cleanPassword, user.passwordHash);
  if (!valid) return null;
  if (isEmailVerificationRequired() && !isEmailVerified(user)) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  let loggedInUser = null;
  await updateDB((draft) => {
    const match = draft.users.find((item) => Number(item.id) === Number(user.id));
    if (!match) return draft;
    match.lastLoginAt = nowISO();
    loggedInUser = { ...match };
    return draft;
  });

  return publicUser(loggedInUser || user);
}

export async function upsertGoogleUser({ email, name = "", googleSub = "", avatarUrl = "" }) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(name || "").trim();
  const cleanGoogleSub = String(googleSub || "").trim();
  const cleanAvatarUrl = String(avatarUrl || "").trim().slice(0, 400_000);
  if (!cleanEmail) {
    throw new Error("EMAIL_REQUIRED");
  }

  let userRecord = null;
  await updateDB((draft) => {
    const now = nowISO();
    const existing = (draft.users || []).find((item) => normalizeEmail(item.email) === cleanEmail);
    if (existing) {
      existing.lastLoginAt = now;
      existing.emailVerifiedAt = existing.emailVerifiedAt || now;
      if (cleanName) {
        existing.name = cleanName;
      } else if (!String(existing.name || "").trim()) {
        existing.name = nameFromEmail(cleanEmail);
      }
      if (!String(existing.authProvider || "").trim()) {
        existing.authProvider = "email";
      }
      if (cleanGoogleSub && !String(existing.googleSub || "").trim()) {
        existing.googleSub = cleanGoogleSub;
      }
      if (!String(existing.avatarUrl || "").trim() && cleanAvatarUrl) {
        existing.avatarUrl = cleanAvatarUrl;
      }
      userRecord = { ...existing };
    } else {
      const id = Number(draft.meta.nextUserId);
      draft.meta.nextUserId += 1;

      const created = {
        id,
        name: cleanName || nameFromEmail(cleanEmail),
        email: cleanEmail,
        phone: "",
        avatarUrl: cleanAvatarUrl,
        // Generate a non-guessable placeholder password hash for OAuth-created users.
        passwordHash: hashPassword(crypto.randomBytes(48).toString("base64url")),
        notificationPreferences: {
          email: true,
          sms: false,
          whatsapp: false,
          productUpdates: true,
          settlementAlerts: true,
          weeklySummary: true,
        },
        createdAt: now,
        lastLoginAt: now,
        emailVerifiedAt: now,
        emailVerificationSentAt: null,
        authProvider: "google",
        googleSub: cleanGoogleSub,
      };

      draft.users.push(created);
      userRecord = { ...created };
    }

    for (const member of draft.members || []) {
      const memberEmail = normalizeEmail(member.email);
      if (memberEmail && memberEmail === cleanEmail) {
        member.userId = Number(userRecord?.id || 0) || null;
      }
    }

    return draft;
  });

  return publicUser(userRecord);
}

export async function findUserById(userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const db = await readDB();
  const user = db.users.find((item) => Number(item.id) === id);
  return publicUser(user || null);
}

export async function findRawUserByEmail(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;
  const db = await readDB();
  return db.users.find((item) => normalizeEmail(item.email) === cleanEmail) || null;
}

export async function createLoginOtpChallenge(email, password) {
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || "");
  if (!cleanEmail || !cleanPassword) return null;

  const db = await readDB();
  const user = db.users.find((item) => normalizeEmail(item.email) === cleanEmail);
  if (!user) return null;

  const valid = verifyPassword(cleanPassword, user.passwordHash);
  if (!valid) return null;
  if (isEmailVerificationRequired() && !isEmailVerified(user)) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  const challengeToken = createOpaqueToken();
  const otpCode = createNumericOtp(6);
  const challengeHash = hashLoginOtpChallengeToken(challengeToken);
  const otpHash = hashLoginOtpCode(challengeToken, otpCode);
  const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MS).toISOString();
  const issuedAt = nowISO();

  await updateDB((draft) => {
    draft.loginOtpChallenges = cleanLoginOtpChallenges(draft.loginOtpChallenges, Date.now());

    for (const challenge of draft.loginOtpChallenges || []) {
      if (Number(challenge.userId) === Number(user.id) && !challenge.usedAt) {
        challenge.usedAt = issuedAt;
      }
    }

    const id = Number(draft.meta.nextLoginOtpChallengeId);
    draft.meta.nextLoginOtpChallengeId += 1;
    draft.loginOtpChallenges.push({
      id,
      userId: Number(user.id),
      email: cleanEmail,
      challengeHash,
      otpHash,
      attempts: 0,
      maxAttempts: LOGIN_OTP_MAX_ATTEMPTS,
      expiresAt,
      usedAt: null,
      createdAt: issuedAt,
    });

    return draft;
  });

  return {
    challengeToken,
    otpCode,
    expiresAt,
    user: publicUser(user),
  };
}

export async function revokeLoginOtpChallenge(challengeToken) {
  const token = String(challengeToken || "").trim();
  if (!token) return;

  const challengeHash = hashLoginOtpChallengeToken(token);

  await updateDB((draft) => {
    const challenge = (draft.loginOtpChallenges || []).find(
      (item) => String(item.challengeHash || "") === challengeHash && !item.usedAt
    );
    if (challenge) {
      challenge.usedAt = nowISO();
    }
    draft.loginOtpChallenges = cleanLoginOtpChallenges(draft.loginOtpChallenges, Date.now());
    return draft;
  });
}

export async function verifyLoginOtpChallenge(challengeToken, otpCode) {
  const token = String(challengeToken || "").trim();
  const normalizedCode = normalizeOtpCode(otpCode);
  if (!token || normalizedCode.length !== 6) {
    throw new Error("INVALID_OTP");
  }

  const challengeHash = hashLoginOtpChallengeToken(token);
  const expectedOtpHash = hashLoginOtpCode(token, normalizedCode);
  let verifiedUser = null;

  await updateDB((draft) => {
    const now = Date.now();
    draft.loginOtpChallenges = cleanLoginOtpChallenges(draft.loginOtpChallenges, now);

    const challenge = (draft.loginOtpChallenges || []).find(
      (item) => String(item.challengeHash || "") === challengeHash
    );
    if (!challenge) {
      throw new Error("INVALID_OTP_CHALLENGE");
    }

    if (challenge.usedAt) {
      throw new Error("OTP_ALREADY_USED");
    }

    const expiresMs = new Date(challenge.expiresAt || 0).getTime();
    if (!Number.isFinite(expiresMs) || expiresMs <= now) {
      challenge.usedAt = nowISO();
      throw new Error("OTP_EXPIRED");
    }

    const maxAttempts = Number(challenge.maxAttempts || LOGIN_OTP_MAX_ATTEMPTS);
    const attempts = Number(challenge.attempts || 0);
    if (attempts >= maxAttempts) {
      challenge.usedAt = nowISO();
      throw new Error("OTP_ATTEMPTS_EXCEEDED");
    }

    if (!safeCompare(String(challenge.otpHash || ""), expectedOtpHash)) {
      challenge.attempts = attempts + 1;
      if (challenge.attempts >= maxAttempts) {
        challenge.usedAt = nowISO();
        throw new Error("OTP_ATTEMPTS_EXCEEDED");
      }
      throw new Error("OTP_INVALID");
    }

    challenge.usedAt = nowISO();

    const user = draft.users.find((item) => Number(item.id) === Number(challenge.userId));
    if (!user) {
      throw new Error("INVALID_OTP_CHALLENGE");
    }

    user.lastLoginAt = nowISO();
    verifiedUser = { ...user };

    for (const item of draft.loginOtpChallenges || []) {
      if (
        Number(item.userId) === Number(user.id) &&
        !item.usedAt &&
        String(item.challengeHash || "") !== String(challenge.challengeHash || "")
      ) {
        item.usedAt = nowISO();
      }
    }

    return draft;
  });

  return publicUser(verifiedUser);
}

function hashOpaqueToken(token) {
  return crypto.createHash("sha256").update(`${getAuthSecret()}::${String(token || "")}`).digest("base64url");
}

export function hashInviteTokenValue(token) {
  return hashOpaqueToken(`invite::${String(token || "")}`);
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createNumericOtp(length = 6) {
  const upper = 10 ** Number(length || 6);
  const value = crypto.randomInt(0, upper);
  return String(value).padStart(length, "0");
}

function normalizeOtpCode(code) {
  return String(code || "")
    .replace(/\D/g, "")
    .slice(0, 6);
}

function hashLoginOtpChallengeToken(token) {
  return hashOpaqueToken(`login-otp-challenge::${String(token || "")}`);
}

function hashLoginOtpCode(challengeToken, otpCode) {
  return hashOpaqueToken(`login-otp-code::${String(challengeToken || "")}::${String(otpCode || "")}`);
}

function hashEmailVerificationToken(token) {
  return hashOpaqueToken(`email-verify::${String(token || "")}`);
}

function cleanPasswordResetTokens(tokens, now = Date.now()) {
  return (tokens || []).filter((item) => {
    const expiresMs = new Date(item.expiresAt || 0).getTime();
    const usedMs = new Date(item.usedAt || 0).getTime();
    if (!item.usedAt && Number.isFinite(expiresMs) && expiresMs > now) return true;
    if (Number.isFinite(usedMs) && usedMs >= now - PASSWORD_RESET_RETENTION_MS) return true;
    return false;
  });
}

function cleanEmailVerificationTokens(tokens, now = Date.now()) {
  return (tokens || []).filter((item) => {
    const expiresMs = new Date(item.expiresAt || 0).getTime();
    const usedMs = new Date(item.usedAt || 0).getTime();
    if (!item.usedAt && Number.isFinite(expiresMs) && expiresMs > now) return true;
    if (Number.isFinite(usedMs) && usedMs >= now - EMAIL_VERIFICATION_RETENTION_MS) return true;
    return false;
  });
}

function cleanLoginOtpChallenges(challenges, now = Date.now()) {
  return (challenges || []).filter((item) => {
    const expiresMs = new Date(item.expiresAt || 0).getTime();
    const usedMs = new Date(item.usedAt || 0).getTime();
    if (Number.isFinite(expiresMs) && expiresMs > now) return true;
    if (Number.isFinite(usedMs) && usedMs >= now - LOGIN_OTP_RETENTION_MS) return true;
    if (Number.isFinite(expiresMs) && expiresMs >= now - LOGIN_OTP_RETENTION_MS) return true;
    return false;
  });
}

export function isOtpLoginEnabled() {
  const defaultEnabled = process.env.NODE_ENV === "production";
  return envToggleOrDefault(process.env.AUTH_2FA_ENABLED, defaultEnabled);
}

export async function createPasswordResetRequest(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const user = await findRawUserByEmail(cleanEmail);
  if (!user) return null;

  const token = createOpaqueToken();
  const tokenHash = hashOpaqueToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();

  await updateDB((draft) => {
    const now = Date.now();
    draft.passwordResetTokens = cleanPasswordResetTokens(draft.passwordResetTokens, now);

    for (const item of draft.passwordResetTokens || []) {
      if (Number(item.userId) === Number(user.id) && !item.usedAt) {
        item.usedAt = nowISO();
      }
    }

    const id = Number(draft.meta.nextPasswordResetTokenId);
    draft.meta.nextPasswordResetTokenId += 1;
    draft.passwordResetTokens.push({
      id,
      userId: Number(user.id),
      tokenHash,
      expiresAt,
      usedAt: null,
      createdAt: nowISO(),
    });
    return draft;
  });

  return {
    token,
    expiresAt,
    user: publicUser(user),
  };
}

export async function resetPasswordWithToken(token, newPassword) {
  const cleanToken = String(token || "").trim();
  const passwordError = validatePasswordStrength(newPassword);
  if (passwordError) {
    throw new Error(passwordError);
  }

  if (!cleanToken) {
    throw new Error("INVALID_RESET_TOKEN");
  }

  const tokenHash = hashOpaqueToken(cleanToken);
  let updatedUser = null;

  await updateDB((draft) => {
    const now = Date.now();
    draft.passwordResetTokens = cleanPasswordResetTokens(draft.passwordResetTokens, now);
    const resetEntry = (draft.passwordResetTokens || []).find(
      (item) =>
        String(item.tokenHash || "") === tokenHash &&
        !item.usedAt &&
        new Date(item.expiresAt).getTime() > now
    );

    if (!resetEntry) {
      throw new Error("INVALID_RESET_TOKEN");
    }

    const user = draft.users.find((item) => Number(item.id) === Number(resetEntry.userId));
    if (!user) {
      throw new Error("INVALID_RESET_TOKEN");
    }

    user.passwordHash = hashPassword(newPassword);
    resetEntry.usedAt = nowISO();

    for (const item of draft.passwordResetTokens || []) {
      if (Number(item.userId) === Number(user.id) && !item.usedAt) {
        item.usedAt = nowISO();
      }
    }

    updatedUser = { ...user };
    return draft;
  });

  return publicUser(updatedUser);
}

export async function createEmailVerificationRequest(email) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  const user = await findRawUserByEmail(cleanEmail);
  if (!user) return null;
  if (isEmailVerified(user)) return null;

  const token = createOpaqueToken();
  const tokenHash = hashEmailVerificationToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS).toISOString();

  await updateDB((draft) => {
    const now = Date.now();
    draft.emailVerificationTokens = cleanEmailVerificationTokens(draft.emailVerificationTokens, now);

    for (const item of draft.emailVerificationTokens || []) {
      if (Number(item.userId) === Number(user.id) && !item.usedAt) {
        item.usedAt = nowISO();
      }
    }

    const id = Number(draft.meta.nextEmailVerificationTokenId);
    draft.meta.nextEmailVerificationTokenId += 1;
    draft.emailVerificationTokens.push({
      id,
      userId: Number(user.id),
      tokenHash,
      email: cleanEmail,
      expiresAt,
      usedAt: null,
      createdAt: nowISO(),
    });

    const draftUser = (draft.users || []).find((item) => Number(item.id) === Number(user.id));
    if (draftUser) {
      draftUser.emailVerificationSentAt = nowISO();
    }
    return draft;
  });

  return {
    token,
    expiresAt,
    user: publicUser(user),
  };
}

export async function verifyEmailWithToken(token) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    throw new Error("INVALID_VERIFY_TOKEN");
  }

  const tokenHash = hashEmailVerificationToken(cleanToken);
  let verifiedUser = null;

  await updateDB((draft) => {
    const now = Date.now();
    draft.emailVerificationTokens = cleanEmailVerificationTokens(draft.emailVerificationTokens, now);

    const verificationEntry = (draft.emailVerificationTokens || []).find(
      (item) =>
        String(item.tokenHash || "") === tokenHash &&
        !item.usedAt &&
        new Date(item.expiresAt || 0).getTime() > now
    );
    if (!verificationEntry) {
      throw new Error("INVALID_VERIFY_TOKEN");
    }

    const user = (draft.users || []).find((item) => Number(item.id) === Number(verificationEntry.userId));
    if (!user) {
      throw new Error("INVALID_VERIFY_TOKEN");
    }

    verificationEntry.usedAt = nowISO();
    user.emailVerifiedAt = user.emailVerifiedAt || nowISO();

    for (const item of draft.emailVerificationTokens || []) {
      if (Number(item.userId) === Number(user.id) && !item.usedAt) {
        item.usedAt = nowISO();
      }
    }

    verifiedUser = { ...user };
    return draft;
  });

  return publicUser(verifiedUser);
}

export function createSessionToken(user) {
  const now = Date.now();
  const payload = {
    sub: String(user?.email || ""),
    email: String(user?.email || ""),
    uid: Number(user?.id || 0),
    name: String(user?.name || ""),
    iat: now,
    exp: now + SESSION_TTL_SECONDS * 1000,
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signPayload(encoded);
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token) {
  const value = String(token || "");
  if (!value.includes(".")) return null;

  const [encodedPayload, signature] = value.split(".");
  if (!encodedPayload || !signature) return null;

  try {
    const expectedSignature = signPayload(encodedPayload);
    if (!safeCompare(signature, expectedSignature)) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8"));
    if (!payload?.exp) return null;
    if (Date.now() > Number(payload.exp)) return null;

    const email = normalizeEmail(payload.email || payload.sub);
    if (!email) return null;

    return {
      userId: Number(payload.uid || 0),
      email,
      name: String(payload.name || ""),
      expiresAt: Number(payload.exp),
    };
  } catch {
    return null;
  }
}

export function getSessionFromRequest(request) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export function getSessionFromCookieStore(cookieStore) {
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function clearSessionCookieOptions() {
  return {
    ...getSessionCookieOptions(),
    maxAge: 0,
  };
}

export function requireAuth(request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return {
      session: null,
      unauthorized: NextResponse.json({ error: "Unauthorized. Please login first." }, { status: 401 }),
    };
  }

  return { session, unauthorized: null };
}
