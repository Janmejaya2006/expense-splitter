import { NextResponse } from "next/server";
import {
  clearSessionCookieOptions,
  createEmailVerificationRequest,
  createSessionToken,
  getSessionCookieOptions,
  isEmailVerificationRequired,
  normalizeEmail,
  publicUser,
  requireAuth,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { sendEmailVerificationEmail } from "@/lib/notifications";
import { readDB, updateDB } from "@/lib/store";
import { parseRequestBody, validationErrorResponse } from "@/lib/validation";
import { z } from "zod";

function sanitizePreferences(input, previous = {}) {
  const source = input && typeof input === "object" ? input : {};
  return {
    email: source.email !== undefined ? Boolean(source.email) : previous.email !== false,
    sms: source.sms !== undefined ? Boolean(source.sms) : Boolean(previous.sms),
    whatsapp: source.whatsapp !== undefined ? Boolean(source.whatsapp) : Boolean(previous.whatsapp),
    productUpdates:
      source.productUpdates !== undefined ? Boolean(source.productUpdates) : previous.productUpdates !== false,
    settlementAlerts:
      source.settlementAlerts !== undefined ? Boolean(source.settlementAlerts) : previous.settlementAlerts !== false,
    weeklySummary:
      source.weeklySummary !== undefined ? Boolean(source.weeklySummary) : previous.weeklySummary !== false,
  };
}

function isAllowedAvatarValue(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return true;

  const lower = candidate.toLowerCase();
  if (lower.startsWith("data:image/png;base64,")) return true;
  if (lower.startsWith("data:image/jpeg;base64,")) return true;
  if (lower.startsWith("data:image/jpg;base64,")) return true;
  if (lower.startsWith("data:image/webp;base64,")) return true;
  if (/^https?:\/\/\S+$/i.test(candidate)) return true;
  if (candidate.startsWith("/")) return true;
  return false;
}

const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1, "Name cannot be empty").max(120, "Name is too long").optional(),
    email: z.string().trim().email("Enter a valid email address").optional(),
    phone: z
      .string()
      .trim()
      .refine((value) => !value || /^\+?[0-9][0-9\s-]{6,19}$/.test(value), "Enter a valid contact number")
      .optional(),
    avatarUrl: z
      .string()
      .trim()
      .max(400_000, "Profile picture is too large")
      .refine((value) => isAllowedAvatarValue(value), "Use PNG, JPG, WEBP, or an image URL")
      .optional(),
    notificationPreferences: z
      .object({
        email: z.boolean().optional(),
        sms: z.boolean().optional(),
        whatsapp: z.boolean().optional(),
        productUpdates: z.boolean().optional(),
        settlementAlerts: z.boolean().optional(),
        weeklySummary: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, "Nothing to update");

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await readDB();
    const user = (db.users || []).find((item) => Number(item.id) === Number(session.userId));
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: publicUser(user) });
  } catch {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const body = await parseRequestBody(request, profilePatchSchema, {
      invalidJsonMessage: "Invalid profile payload",
    });
    const hasName = body.name !== undefined;
    const hasEmail = body.email !== undefined;
    const hasPhone = body.phone !== undefined;
    const hasAvatar = body.avatarUrl !== undefined;
    const hasPrefs = body.notificationPreferences !== undefined;
    const nextName = hasName ? body.name : undefined;
    const nextEmail = hasEmail ? normalizeEmail(body.email) : undefined;
    const nextPhone = hasPhone ? body.phone : undefined;
    const nextAvatarUrl = hasAvatar ? String(body.avatarUrl || "").trim().slice(0, 400_000) : undefined;

    let updatedUser = null;
    let emailChanged = false;
    await updateDB((draft) => {
      const user = (draft.users || []).find((item) => Number(item.id) === Number(session.userId));
      if (!user) {
        throw new Error("USER_NOT_FOUND");
      }

      if (hasEmail) {
        const duplicate = (draft.users || []).some(
          (item) => Number(item.id) !== Number(user.id) && normalizeEmail(item.email) === nextEmail
        );
        if (duplicate) {
          throw new Error("EMAIL_EXISTS");
        }
      }

      const oldEmail = normalizeEmail(user.email);
      if (hasName) user.name = nextName;
      if (hasEmail) {
        user.email = nextEmail;
        emailChanged = normalizeEmail(oldEmail) !== normalizeEmail(nextEmail);
        if (emailChanged && isEmailVerificationRequired()) {
          user.emailVerifiedAt = null;
        }
      }
      if (hasPhone) user.phone = nextPhone;
      if (hasAvatar) user.avatarUrl = nextAvatarUrl;
      if (hasPrefs) {
        user.notificationPreferences = sanitizePreferences(body.notificationPreferences, user.notificationPreferences);
      }

      for (const member of draft.members || []) {
        if (Number(member.userId) === Number(user.id)) {
          member.email = user.email;
        } else if (hasEmail && normalizeEmail(member.email) === oldEmail) {
          member.email = user.email;
          member.userId = Number(user.id);
        }
      }

      updatedUser = { ...user };
      return draft;
    });

    const publicUpdatedUser = publicUser(updatedUser);
    let verificationDelivery = null;
    if (emailChanged && isEmailVerificationRequired() && publicUpdatedUser?.email) {
      const verifyRequest = await createEmailVerificationRequest(publicUpdatedUser.email);
      if (verifyRequest?.token) {
        const verifyLink = `${new URL(request.url).origin}/verify-email/${verifyRequest.token}`;
        try {
          await sendEmailVerificationEmail({
            toEmail: publicUpdatedUser.email,
            verifyLink,
          });
          verificationDelivery = { status: "sent" };
        } catch (error) {
          verificationDelivery = { status: "failed", message: error.message || "Email delivery failed" };
        }
      }
    }

    const response = NextResponse.json({
      success: true,
      user: publicUpdatedUser,
      requiresEmailVerification: Boolean(emailChanged && isEmailVerificationRequired()),
      verificationDelivery,
    });
    if (emailChanged && isEmailVerificationRequired()) {
      response.cookies.set(SESSION_COOKIE_NAME, "", clearSessionCookieOptions());
    } else {
      response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(publicUpdatedUser), getSessionCookieOptions());
    }
    return response;
  } catch (error) {
    const validationResponse = validationErrorResponse(error);
    if (validationResponse) return validationResponse;
    if (error.message === "USER_NOT_FOUND") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (error.message === "EMAIL_EXISTS") {
      return NextResponse.json({ error: "Email is already used by another account" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
