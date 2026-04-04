"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function VerifyEmailCard({ token = "" }) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let redirectTimer = null;

    async function verify() {
      if (!token) {
        if (!cancelled) {
          setError("Verification token is missing.");
          setBusy(false);
        }
        return;
      }

      try {
        const response = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || "Verification failed");
        }
        if (!cancelled) {
          setNotice("Your email has been verified. You are now signed in.");
          redirectTimer = setTimeout(() => router.replace("/groups"), 1500);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Verification failed");
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    verify();
    return () => {
      cancelled = true;
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [token, router]);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">Account Security</p>
          <h1>Email Verification</h1>
          <p>We are confirming your email before allowing full account access.</p>
        </div>
        {busy ? <p className="auth-copy">Verifying your email...</p> : null}
        {notice ? <p className="auth-copy">{notice}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
        <p className="auth-copy">
          Continue to <Link href={notice ? "/groups" : "/login"}>{notice ? "Go to dashboard" : "Login"}</Link>
        </p>
      </section>
    </main>
  );
}
