"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteAcceptCard({ token = "" }) {
  const router = useRouter();
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const status = useMemo(() => invite?.status || "pending", [invite]);

  useEffect(() => {
    let ignore = false;
    const run = async () => {
      try {
        const response = await fetch(`/api/invites/${token}`);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.error || "Could not load invite");
        }
        if (!ignore) {
          setInvite(body.invite || null);
        }
      } catch (err) {
        if (!ignore) setError(err.message || "Could not load invite");
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    run();
    return () => {
      ignore = true;
    };
  }, [token]);

  const acceptInvite = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/invites/${token}/accept`, {
        method: "POST",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error || "Could not accept invite");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err.message || "Could not accept invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-heading">
          <p className="eyebrow">Group Invite</p>
          <h1>Join Group</h1>
          <p>Accept invite and join the shared expense group in one click.</p>
        </div>

        {loading ? <p className="auth-copy">Loading invite...</p> : null}
        {!loading && invite ? (
          <div className="stack">
            <p><strong>Group:</strong> {invite.group?.name}</p>
            <p><strong>Role:</strong> {invite.role}</p>
            <p><strong>Invited Email:</strong> {invite.email}</p>
            <p><strong>Status:</strong> {status}</p>
            {status === "pending" ? (
              <button className="btn primary" onClick={acceptInvite} disabled={busy} type="button">
                {busy ? "Joining..." : "Accept & Join"}
              </button>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="auth-error">{error}</p> : null}
        <p className="auth-copy">
          Need to login first? <Link href="/login">Login</Link>
        </p>
      </section>
    </main>
  );
}
