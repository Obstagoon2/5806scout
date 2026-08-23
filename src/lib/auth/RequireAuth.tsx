"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { needsEmailVerification } from "@/lib/emailVerification";
import { auth, db } from "@/lib/firebase/client";
import { sendEmailVerification, signOut, type User } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <Loading />;
  }

  // Keyed by uid so switching accounts starts the gate over rather than
  // inheriting the previous user's "already verified" state.
  return (
    <VerifyEmailGate key={user.uid} user={user}>
      {children}
    </VerifyEmailGate>
  );
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-graphite-500">
      <span
        aria-hidden
        className="h-3.5 w-3.5 animate-spin-loading rounded-full border-2 border-graphite-300 border-t-maroon-500"
      />
      Loading…
    </div>
  );
}

/** How often to re-check, so verifying in another tab or on a phone lets this
 *  one in without the reader having to find a button. */
const POLL_MS = 5000;

/**
 * Holds an unverified signup at the door (see src/lib/emailVerification.ts for
 * who that is). Firebase caches `emailVerified` on the client, so the only way
 * to learn the link was clicked is to `reload()` the user — which mutates the
 * same object in place, hence the explicit `cleared` state rather than
 * re-reading a prop.
 */
function VerifyEmailGate({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const { profile } = useAuth();
  const [cleared, setCleared] = useState(() => !needsEmailVerification(user));
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Mirror the verdict onto users/{uid}, which is the only copy of it a
  // teammate can read — the roster hides whoever is still held here (see
  // showsInRoster). Read off the profile's own two fields rather than the
  // profile object, so a snapshot that changed something else doesn't
  // re-enter this. A write that fails leaves the roster a session behind,
  // which the next sign-in corrects; there is nothing useful to say about it
  // on a screen whose only job is "go read your email".
  const storedVerified = profile?.emailVerified;
  const hasProfile = profile !== null;
  useEffect(() => {
    if (!hasProfile || storedVerified === cleared) return;
    void updateDoc(doc(db, "users", user.uid), {
      emailVerified: cleared,
    }).catch(() => {});
  }, [cleared, hasProfile, storedVerified, user.uid]);

  useEffect(() => {
    if (cleared) return;
    const id = setInterval(() => {
      void user
        .reload()
        .then(() => {
          if (!needsEmailVerification(user)) setCleared(true);
        })
        .catch(() => {
          // A failed refresh just means the next tick tries again; the
          // Refresh button is there for anyone who doesn't want to wait.
        });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [cleared, user]);

  if (cleared) return <>{children}</>;

  async function handleResend() {
    setError(null);
    setBusy(true);
    try {
      await sendEmailVerification(user);
      setResent(true);
    } catch {
      setError(
        "Could not send another email just yet — wait a minute and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setError(null);
    setBusy(true);
    try {
      await user.reload();
      if (needsEmailVerification(user)) {
        setError("Still not verified — open the link in the email first.");
      } else {
        setCleared(true);
      }
    } catch {
      setError("Could not check just now — try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="surface-card w-full max-w-md p-6">
        <h1 className="page-title">
          <span aria-hidden className="page-rule" />
          Verify your email
        </h1>
        <p className="mt-3 text-sm text-graphite-600">
          We sent a link to{" "}
          <span className="font-medium text-graphite-900">{user.email}</span>.
          Open it and this page will let you in on its own.
        </p>
        <p className="mt-2 text-xs text-graphite-500">
          Not there? Check spam — it comes from Firebase, not from your team.
        </p>

        {resent && (
          <p className="badge-success mt-4 rounded-md px-3 py-2 text-sm normal-case tracking-normal">
            Sent again — it can take a minute to arrive.
          </p>
        )}
        {error && (
          <p className="badge-error mt-4 rounded-md px-3 py-2 text-sm normal-case tracking-normal">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRefresh()}
            className="btn-primary px-4 py-2"
          >
            I&apos;ve verified
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleResend()}
            className="btn-secondary px-4 py-2"
          >
            Resend email
          </button>
          <button
            type="button"
            onClick={() => void signOut(auth)}
            className="btn-ghost border border-graphite-200 px-4 py-2"
          >
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
