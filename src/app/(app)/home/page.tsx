"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { NAV_ITEMS } from "@/lib/nav";
import Link from "next/link";

export default function HomePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 md:px-6">
      <div className="rounded-lg border border-graphite-200 bg-white px-6 py-10 text-center">
        <p className="font-stat text-sm font-semibold uppercase tracking-widest text-maroon-600">
          FRC 5806
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-graphite-900 md:text-3xl">
          Welcome to this scouting website produced by Team 5806
        </h1>
        {profile && (
          <p className="mt-3 text-sm text-graphite-500">
            Signed in as {profile.fullName} ({profile.role}).
          </p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-graphite-500">
          Jump in
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-lg border border-graphite-200 bg-white px-4 py-3 text-sm font-medium text-graphite-800 transition hover:border-maroon-400 hover:text-maroon-700"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
