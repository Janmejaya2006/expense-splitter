"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Could not process request");
      }

      setNotice(body.message || "Reset instructions sent.");
    } catch (err) {
      setError(err.message || "Could not process request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">Password Recovery</p>
          <h1>Forgot Password</h1>
          <p>Enter your account email and we will send a reset link.</p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Sending..." : "Send Reset Link"}
          </button>
        </form>

        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-copy">{notice}</p> : null}
        <p className="auth-copy">
          Back to <Link href="/login">Login</Link>
        </p>
      </section>
    </main>
  );
}
