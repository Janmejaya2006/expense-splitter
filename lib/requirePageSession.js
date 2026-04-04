import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookieStore } from "@/lib/auth";

export async function requirePageSession(returnToPath = "/dashboard") {
  const cookieStore = await cookies();
  const session = getSessionFromCookieStore(cookieStore);

  if (!session) {
    const encoded = encodeURIComponent(String(returnToPath || "/dashboard"));
    redirect(`/login?returnTo=${encoded}`);
  }

  return session;
}
