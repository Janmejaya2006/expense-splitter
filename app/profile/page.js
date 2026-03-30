import ProfileForm from "@/components/ProfileForm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookieStore } from "@/lib/auth";

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookieStore(cookieStore);

  if (!session) {
    redirect("/login");
  }

  return <ProfileForm />;
}
