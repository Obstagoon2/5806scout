"use client";

import { auth, db } from "@/lib/firebase/client";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [teamNumber, setTeamNumber] = useState("");
  const [asAdmin, setAsAdmin] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      // Admin code is validated server-side (never compared in the bundle)
      // BEFORE the Firebase user is created, so a bad code costs nothing.
      if (asAdmin) {
        const res = await fetch("/api/admin-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: adminCode }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          setError(body?.error ?? "Invalid admin code");
          return;
        }
      }

      const teamId = teamNumber.trim();
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: fullName });

      // Bootstrap the team doc (idempotent per firestore.rules: only
      // created if it doesn't already exist).
      await setDoc(
        doc(db, "teams", teamId),
        {
          teamNumber: teamId,
          teamName: teamId,
          createdAt: serverTimestamp(),
        },
        { merge: false },
      ).catch(() => {
        // Team already exists — expected for the 2nd+ scout on a team.
      });

      await setDoc(doc(db, "users", credential.user.uid), {
        email,
        fullName,
        teamId,
        role: asAdmin ? "admin" : "scout",
        active: true,
        createdAt: serverTimestamp(),
      });

      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-graphite-900">
          {asAdmin ? "Create an admin account" : "Create a scout account"}
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          Scouts sign up with just the form below. Admins also need the team’s
          admin code.
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
          <Field label="Password">
            <input
              required
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-graphite-700">
            <input
              type="checkbox"
              checked={asAdmin}
              onChange={(e) => setAsAdmin(e.target.checked)}
              className="h-4 w-4 accent-maroon-600"
            />
            Sign up as Admin
          </label>

          {asAdmin && (
            <Field label="Admin Code">
              <input
                required
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                className={inputClass}
                placeholder="Ask your team lead for the code"
              />
            </Field>
          )}

          {error && (
            <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-md bg-maroon-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-graphite-500">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-maroon-600 hover:text-maroon-700">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}

const inputClass =
  "w-full rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm text-graphite-900 outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-graphite-700">{label}</span>
      {children}
    </label>
  );
}
