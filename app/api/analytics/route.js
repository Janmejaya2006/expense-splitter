import { NextResponse } from "next/server";
import { buildAnalytics, readDB } from "@/lib/store";
import { requireAuth } from "@/lib/auth";
import { scopeDbForUser } from "@/lib/access";

export async function GET(request) {
  const { session, unauthorized } = requireAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const db = await readDB();
    const scopedDb = scopeDbForUser(db, session);
    const analytics = buildAnalytics(scopedDb);
    return NextResponse.json(analytics);
  } catch {
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
