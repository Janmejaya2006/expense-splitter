import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getWebPushPublicKey, hasWebPushConfig } from "@/lib/webPush";

export async function GET(request) {
  const { unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  if (!hasWebPushConfig()) {
    return NextResponse.json(
      { enabled: false, error: "Web Push is not configured on server." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    enabled: true,
    publicKey: getWebPushPublicKey(),
  });
}

