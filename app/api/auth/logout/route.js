import { NextResponse } from "next/server";
import { clearSessionCookieOptions, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE_NAME, "", clearSessionCookieOptions());
  return response;
}
