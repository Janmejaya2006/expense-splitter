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
      setError("Passwords do not match");
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
        setForm(EMPTY_REGISTER_FORM);
        setNotice("Account created. Check your email for a verification link before logging in.");
        router.replace("/login");
        router.refresh();
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">Create Account</p>
          <h1>Register for Expense Split</h1>
          <p>Create your account and verify your email to activate login.</p>
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Full name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            required
          />
          <input
            type="tel"
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            required
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={form.confirmPassword}
            onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
            required
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Creating account..." : "Register"}
          </button>
        </form>

        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-copy">{notice}</p> : null}
        <p className="auth-copy">
          Already have an account? <Link href="/login">Login</Link>
        </p>
      </section>
    </main>
  );
}
