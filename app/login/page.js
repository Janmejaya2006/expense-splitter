import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import LoginForm from "@/components/LoginForm";
import { getSessionFromCookieStore } from "@/lib/auth";

export default async function LoginPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookieStore(cookieStore);

  if (session) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
