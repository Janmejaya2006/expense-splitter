"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const EMPTY_PROFILE = {
  name: "",
  email: "",
  phone: "",
  notificationPreferences: {
    email: true,
    sms: false,
    whatsapp: false,
    productUpdates: true,
    settlementAlerts: true,
  },
};

export default function ProfileForm() {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const response = await fetch("/api/profile");
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || "Could not load profile");
        }

        if (!ignore) {
          setProfile({
            ...EMPTY_PROFILE,
            ...body.user,
            notificationPreferences: {
              ...EMPTY_PROFILE.notificationPreferences,
              ...(body.user?.notificationPreferences || {}),
            },
          });
        }
      } catch (err) {
        if (!ignore) setError(err.message || "Could not load profile");
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Could not update profile");
      }
      setProfile((prev) => ({
        ...prev,
        ...body.user,
      }));
      if (body.requiresEmailVerification) {
        setNotice("Email updated. Please verify your new email address, then login again.");
        if (typeof window !== "undefined") {
          window.setTimeout(() => {
            window.location.href = "/login";
          }, 1400);
        }
      } else {
        setNotice("Profile updated");
      }
    } catch (err) {
      setError(err.message || "Could not update profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">Account</p>
          <h1>Profile Settings</h1>
          <p>Update your details and notification preferences.</p>
        </div>

        {loading ? <p className="auth-copy">Loading profile...</p> : null}
        {!loading ? (
          <form className="stack" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Full name"
              value={profile.name}
              onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={profile.email}
              onChange={(event) => setProfile((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
            <input
              type="tel"
              placeholder="Phone"
              value={profile.phone}
              onChange={(event) => setProfile((prev) => ({ ...prev, phone: event.target.value }))}
            />

            <label className="pref-check">
              <input
                type="checkbox"
                checked={profile.notificationPreferences.email}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    notificationPreferences: {
                      ...prev.notificationPreferences,
                      email: event.target.checked,
                    },
                  }))
                }
              />
              Email notifications
            </label>
            <label className="pref-check">
              <input
                type="checkbox"
                checked={profile.notificationPreferences.sms}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    notificationPreferences: {
                      ...prev.notificationPreferences,
                      sms: event.target.checked,
                    },
                  }))
                }
              />
              SMS notifications
            </label>
            <label className="pref-check">
              <input
                type="checkbox"
                checked={profile.notificationPreferences.whatsapp}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    notificationPreferences: {
                      ...prev.notificationPreferences,
                      whatsapp: event.target.checked,
                    },
                  }))
                }
              />
              WhatsApp notifications
            </label>
            <label className="pref-check">
              <input
                type="checkbox"
                checked={profile.notificationPreferences.settlementAlerts}
                onChange={(event) =>
                  setProfile((prev) => ({
                    ...prev,
                    notificationPreferences: {
                      ...prev.notificationPreferences,
                      settlementAlerts: event.target.checked,
                    },
                  }))
                }
              />
              Settlement alerts
            </label>

            <button className="btn primary" disabled={busy} type="submit">
              {busy ? "Saving..." : "Save Profile"}
            </button>
          </form>
        ) : null}

        {error ? <p className="auth-error">{error}</p> : null}
        {notice ? <p className="auth-copy">{notice}</p> : null}
        <p className="auth-copy">
          Back to <Link href="/">Dashboard</Link>
        </p>
      </section>
    </main>
  );
}
