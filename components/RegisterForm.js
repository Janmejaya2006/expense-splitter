"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EMPTY_REGISTER_FORM = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_REGISTER_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
        }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Registration failed");
      }

      if (body.requiresEmailVerification) {
        setNotice("Account created. Verify your email, then login.");
        setForm(EMPTY_REGISTER_FORM);
        setTimeout(() => {
          router.replace("/login");
          router.refresh();
        }, 900);
        return;
      }

      setNotice("Account created successfully. Redirecting to login...");
      setForm(EMPTY_REGISTER_FORM);
      setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 700);
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card auth-card-compact">
        <div className="auth-heading">
          <p className="eyebrow">Create Account</p>
          <h1>Register</h1>
          <p>Create your account to start splitting expenses with your group.</p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field-wrap">
            <span>Full Name</span>
            <input
              type="text"
              placeholder="Your name"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>
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
            <span>Phone (optional)</span>
            <input
              type="tel"
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />
          </label>
          <label className="field-wrap">
            <span>Password</span>
            <input
              type="password"
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>
          <label className="field-wrap">
            <span>Confirm Password</span>
            <input
              type="password"
              placeholder="Re-enter password"
              value={form.confirmPassword}
              onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
              required
            />
          </label>

          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Creating account..." : "Create Account"}
          </button>
        </form>

        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-copy">{notice}</p> : null}
        <p className="auth-copy">
          Already have an account? <Link href="/login">Login</Link>
        </p>
        <p className="auth-copy">
          Want to preview imported UI types? <Link href="/">Open UI Showcase</Link>
        </p>
        <p className="security-badge">Protected by rate limiting &amp; 2FA</p>
      </section>
    </main>
  );
}
