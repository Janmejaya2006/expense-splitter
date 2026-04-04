"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EMPTY_LOGIN_FORM = {
  email: "",
  password: "",
};

export default function LoginForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_LOGIN_FORM);
  const [otpCode, setOtpCode] = useState("");
  const [otpMeta, setOtpMeta] = useState({
    challengeToken: "",
    maskedEmail: "",
    expiresAt: "",
  });
  const [otpPhase, setOtpPhase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requestOtp = async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "request_otp",
        email: form.email,
        password: form.password,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Login failed");
    }

    if (!body.requiresOtp) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }

    setOtpMeta({
      challengeToken: String(body.challengeToken || ""),
      maskedEmail: String(body.maskedEmail || ""),
      expiresAt: String(body.expiresAt || ""),
    });
    setOtpCode("");
    setOtpPhase(true);
  };

  const verifyOtp = async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "verify_otp",
        challengeToken: otpMeta.challengeToken,
        otp: otpCode,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || "Invalid OTP");
    }

    router.replace("/dashboard");
    router.refresh();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      if (otpPhase) {
        await verifyOtp();
      } else {
        await requestOtp();
      }
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-compact">
        <div className="auth-heading">
          <p className="eyebrow">Secure Access</p>
          <h1>Expense Split Login</h1>
          <p>{otpPhase ? "Enter OTP to finish login." : "Login to continue to your groups and expenses."}</p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          {otpPhase ? (
            <>
              <p className="auth-copy">
                OTP sent to <strong>{otpMeta.maskedEmail || form.email}</strong>
              </p>
              <label className="field-wrap">
                <span>One-Time Password</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="Enter 6-digit OTP"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label className="field-wrap">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </label>
              <label className="field-wrap">
                <span>Password</span>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </label>
            </>
          )}

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Please wait..." : otpPhase ? "Verify OTP & Login" : "Continue to OTP"}
          </button>
          {otpPhase ? (
            <>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => {
                  setOtpPhase(false);
                  setOtpCode("");
                  setOtpMeta({ challengeToken: "", maskedEmail: "", expiresAt: "" });
                }}
              >
                Use Different Email
              </button>
              <button className="btn" type="button" disabled={busy} onClick={requestOtp}>
                Resend OTP
              </button>
            </>
          ) : null}
        </form>

        {error ? <p className="auth-error">{error}</p> : null}
        <p className="auth-copy">
          Forgot password? <Link href="/forgot-password">Reset it</Link>
        </p>
        <p className="auth-copy">
          Need an account? <Link href="/register">Register</Link>
        </p>
        <p className="auth-copy">
          Want to preview imported UI types? <Link href="/">Open UI Showcase</Link>
        </p>
        <p className="security-badge">Protected by rate limiting &amp; 2FA</p>
      </section>
    </main>
  );
}
