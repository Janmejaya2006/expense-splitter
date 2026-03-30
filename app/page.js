import Dashboard from "@/components/Dashboard";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookieStore } from "@/lib/auth";

export default async function HomePage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookieStore(cookieStore);

  if (!session) {
    redirect("/login");
  }

  return <Dashboard loggedInUserEmail={session.email} loggedInUserId={session.userId} />;
}
