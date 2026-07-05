"use client";

import { auth } from "@/lib/firebase/client";
import { signInWithEmailAndPassword } from "firebase/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        <h1 className="text-2xl font-semibold text-graphite-900">Log in</h1>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-graphite-700">Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm text-graphite-900 outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-graphite-700">Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm text-graphite-900 outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100"
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
        </form>

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
