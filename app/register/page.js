import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import RegisterForm from "@/components/RegisterForm";
import { getSessionFromCookieStore } from "@/lib/auth";

export default async function RegisterPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookieStore(cookieStore);

  if (session) {
    redirect("/");
  }

  return <RegisterForm />;
}
