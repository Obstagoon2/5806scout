"use client";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { PasswordField } from "@/components/PasswordField";
import { auth, db } from "@/lib/firebase/client";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LionMark } from "@/components/LionMark";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [teamNumber, setTeamNumber] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Creates the team (if new) + user profile docs for a freshly
  // authenticated user. Shared by the email/password and Google paths.
  //
  // A team can have any number of admins, so signing up as one only writes
  // role: "admin" on the profile — nothing on the team doc is claimed.
  async function createProfileAndTeam(newUser: User, teamId: string): Promise<boolean> {
    const teamRef = doc(db, "teams", teamId);
    const userRef = doc(db, "users", newUser.uid);

    try {
      // Transaction so two people signing up for a brand-new team at nearly
      // the same time can't both create — and disagree about — its team doc.
      await runTransaction(db, async (tx) => {
        const teamSnap = await tx.get(teamRef);

        if (!teamSnap.exists()) {
          tx.set(teamRef, {
            teamNumber: teamId,
            teamName: teamId,
            createdAt: serverTimestamp(),
          });
        }

        tx.set(userRef, {
          email: newUser.email ?? email,
          fullName: fullName.trim() || newUser.displayName || "",
          teamId,
          role: asAdmin ? "admin" : "scout",
          active: true,
          createdAt: serverTimestamp(),
        });
      });
      return true;
    } catch {
      // Roll back the auth account we just created — otherwise the rejected
      // signup can never retry with this email. If the delete itself fails,
      // at least sign out so the user isn't left half-authenticated with no
      // profile.
      await newUser.delete().catch(() => signOut(auth).catch(() => {}));
      setError("Signup failed");
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const teamId = teamNumber.trim();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: fullName });

      if (await createProfileAndTeam(credential.user, teamId)) {
        // A typed-in address is the one thing signup can't take on trust, so
        // send the proof-of-ownership link now. RequireAuth holds them at the
        // "check your inbox" screen until it's clicked; a failure to send
        // isn't fatal, because that screen can resend.
        await sendEmailVerification(credential.user).catch(() => {});
        router.replace("/home");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  // Google path: the popup replaces email/password (name comes from the
  // Google account unless typed), but the team number still comes from the
  // form.
  async function handleGoogle() {
    setError(null);
    const teamId = teamNumber.trim();
    if (!teamId) {
      setError("Enter your team number first, then continue with Google.");
      return;
    }
    setSubmitting(true);

    try {
      const credential = await signInWithPopup(auth, new GoogleAuthProvider());

      // Returning user who already has a profile — just take them home.
      const existing = await getDoc(doc(db, "users", credential.user.uid));
      if (existing.exists()) {
        router.replace("/home");
        return;
      }

      if (await createProfileAndTeam(credential.user, teamId)) {
        router.replace("/home");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col md:flex-row">
      <div className="hazard-stripe relative flex flex-col justify-between overflow-hidden bg-maroon-700 px-8 py-10 text-white md:w-2/5 md:px-12 md:py-16">
        <div className="absolute inset-0 bg-maroon-700/85" />
        <div className="relative flex items-center gap-2.5">
          <LionMark className="h-9 w-9 text-white" />
          <span className="text-lg font-semibold tracking-tight">FRC Scouting</span>
        </div>
        <div className="relative mt-10 md:mt-0">
          <p className="stat text-xs uppercase tracking-widest text-maroon-100">Team 5806</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight md:text-3xl">
            Join the crew. Log data that wins alliances.
          </h1>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-graphite-900">
          {asAdmin ? "Create an admin account" : "Create a scout account"}
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          Scouts sign up with just the form below, then confirm the emailed
          link. A team can have as many admins as it needs — tick the box to
          sign up as one, or have an existing admin promote you from the Team
          tab.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field label="Full name">
            <input
              required
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Team number">
            <input
              required
              type="text"
              inputMode="numeric"
              value={teamNumber}
              onChange={(e) => setTeamNumber(e.target.value)}
              className={`${inputClass} font-stat`}
              placeholder="5806"
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={6}
          />

          <label className="flex items-center gap-2 text-sm text-graphite-700">
            <input
              type="checkbox"
              checked={asAdmin}
              onChange={(e) => setAsAdmin(e.target.checked)}
              className="h-4 w-4 accent-maroon-600"
            />
            Sign up as Admin
          </label>

          {error && (
            <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary mt-2"
          >
            {submitting ? "Creating account…" : "Sign up"}
          </button>

          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-graphite-400">
            <span className="h-px flex-1 bg-graphite-200" />
            or
            <span className="h-px flex-1 bg-graphite-200" />
          </div>

          <GoogleSignInButton
            label="Sign up with Google"
            onClick={() => void handleGoogle()}
            disabled={submitting}
          />
          <p className="text-center text-xs text-graphite-500">
            With Google you can skip the email and password — just fill in your
            team number first.
          </p>
        </form>

        <p className="mt-6 text-center text-sm text-graphite-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-maroon-600 dark:text-maroon-400 hover:text-maroon-700 dark:hover:text-maroon-300">
            Log in
          </Link>
        </p>
      </div>
      </div>
    </main>
  );
}

const inputClass = "field-input";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-graphite-700">{label}</span>
      {children}
    </label>
  );
}
