"use client";

import { auth } from "@/lib/firebase/client";
import { FirebaseError } from "firebase/app";
import { sendPasswordResetEmail, signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const inputClass =
  "w-full rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm text-graphite-900 outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"login" | "forgot">("login");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {mode === "login" ? (
          <>
            <h1 className="text-2xl font-semibold text-graphite-900">Log in</h1>

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-graphite-700">Email</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-graphite-700">Password</span>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </label>

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
                {submitting ? "Logging in…" : "Log in"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode("forgot");
                }}
                className="text-center text-sm font-medium text-maroon-600 hover:text-maroon-700"
              >
                Forgot password?
              </button>
            </form>
          </>
        ) : (
          <ForgotPasswordForm onBack={() => setMode("login")} />
        )}

        <p className="mt-6 text-center text-sm text-graphite-500">
          Need an account?{" "}
          <Link href="/signup" className="font-medium text-maroon-600 hover:text-maroon-700">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"sent" | "error" | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setSubmitting(true);

    try {
      await sendPasswordResetEmail(auth, email);
      setResult("sent");
    } catch (err) {
      // Firebase's email enumeration protection means a nonexistent account
      // also resolves successfully — auth/user-not-found only fires if that
      // protection is ever disabled for this project, and we deliberately
      // don't reveal account existence either way.
      if (err instanceof FirebaseError && err.code === "auth/user-not-found") {
        setResult("sent");
      } else {
        setResult("error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-graphite-900">Reset password</h1>
      <p className="mt-1 text-sm text-graphite-500">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-graphite-700">Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>

        {result === "sent" && (
          <p className="rounded-md bg-graphite-50 px-3 py-2 text-sm text-graphite-700">
            If an account exists for that email, we&apos;ve sent a reset link.
            Please check your inbox and your spam.
          </p>
        )}
        {result === "error" && (
          <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
            Something went wrong. Please try again.
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-md bg-maroon-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
        >
          {submitting ? "Sending…" : "Send reset link"}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="text-center text-sm font-medium text-maroon-600 hover:text-maroon-700"
        >
          Back to log in
        </button>
      </form>
    </>
  );
}
