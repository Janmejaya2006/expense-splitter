"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function VerifyEmailCard({ token = "" }) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

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
    };
  }, [token]);

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
          Continue to <Link href={notice ? "/" : "/login"}>{notice ? "Dashboard" : "Login"}</Link>
        </p>
      </section>
    </main>
  );
}
