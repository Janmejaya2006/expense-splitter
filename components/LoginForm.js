"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const EMPTY_LOGIN_FORM = {
  email: "",
  password: "",
};

export default function LoginForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_LOGIN_FORM);
  const [otp, setOtp] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const handleCredentialsSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);

    try {
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

      if (body.requiresOtp) {
        setOtpStep(true);
        setChallengeToken(String(body.challengeToken || ""));
        setMaskedEmail(String(body.maskedEmail || form.email));
        setExpiresAt(String(body.expiresAt || ""));
        setNotice(String(body.delivery?.message || "Verification code sent."));
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  const handleOtpSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "verify_otp",
          challengeToken,
          otp,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "OTP verification failed");
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err.message || "OTP verification failed");
    } finally {
      setBusy(false);
    }
  };

  const handleBackToCredentials = () => {
    setOtpStep(false);
    setOtp("");
    setChallengeToken("");
    setMaskedEmail("");
    setExpiresAt("");
    setNotice("");
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">Secure Access</p>
          <h1>Login to Expense Split Dashboard</h1>
          <p>
            {otpStep
              ? "Enter the OTP sent to your email to complete login."
              : "Use your registered account credentials to continue."}
          </p>
        </div>

        {!otpStep ? (
          <form className="stack" onSubmit={handleCredentialsSubmit}>
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Checking..." : "Continue"}
            </button>
          </form>
        ) : (
          <form className="stack" onSubmit={handleOtpSubmit}>
            <p className="auth-copy">
              Verification code sent to <strong>{maskedEmail || form.email}</strong>
              {expiresAt ? ` (expires around ${new Date(expiresAt).toLocaleTimeString()})` : ""}.
            </p>
            <input
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="6-digit OTP"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
              required
            />
            <button className="btn primary" type="submit" disabled={busy || otp.length < 6}>
              {busy ? "Verifying..." : "Verify & Login"}
            </button>
            <div className="split">
              <button className="btn ghost" onClick={handleBackToCredentials} disabled={busy} type="button">
                Back
              </button>
              <button className="btn ghost" onClick={handleCredentialsSubmit} disabled={busy} type="button">
                Resend OTP
              </button>
            </div>
          </form>
        )}

        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-copy">{notice}</p> : null}
        <p className="auth-copy">
          Forgot password? <Link href="/forgot-password">Reset it</Link>
        </p>
        <p className="auth-copy">
          Need an account? <Link href="/register">Register</Link>
        </p>
      </section>
    </main>
  );
}
