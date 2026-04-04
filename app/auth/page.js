import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionFromCookieStore } from "@/lib/auth";

export default async function AuthChoicePage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookieStore(cookieStore);

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-compact">
        <div className="auth-heading">
          <p className="eyebrow">Welcome</p>
          <h1>Choose an Option</h1>
          <p>Sign in to continue, or create a new account to start using groups and expenses.</p>
        </div>

        <div className="stack">
          <Link href="/login" className="btn primary" style={{ textAlign: "center" }}>
            Login
          </Link>
          <Link href="/register" className="btn" style={{ textAlign: "center" }}>
            Sign Up
          </Link>
        </div>

        <p className="auth-copy">
          Want to preview imported UI types? <Link href="/">Open UI Showcase</Link>
        </p>
      </section>
    </main>
  );
}
