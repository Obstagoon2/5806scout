"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { NAV_ITEMS } from "@/lib/nav";
import Link from "next/link";
import { LionMark } from "@/components/LionMark";

export default function HomePage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 md:px-6">
      <div className="hazard-stripe relative overflow-hidden rounded-lg text-center text-white">
        <div className="absolute inset-0 bg-maroon-700/85" />
        <div className="relative flex flex-col items-center px-6 py-12">
          <LionMark className="h-12 w-12 text-white" />
          <p className="stat mt-4 text-sm font-semibold uppercase tracking-widest text-maroon-100">
            FRC 5806
          </p>
          <h1 className="mt-2 text-2xl font-semibold md:text-3xl">
            Welcome to the scouting console
          </h1>
          {profile && (
            <p className="mt-3 text-sm text-maroon-100">
              Signed in as {profile.fullName} ({profile.role}).
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="section-title">Jump in</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="surface-card group flex items-center justify-between px-4 py-3.5 text-sm font-medium text-graphite-800 transition hover:border-maroon-400 hover:text-maroon-700 dark:hover:text-maroon-300"
              >
                {item.label}
                <span
                  aria-hidden
                  className="text-graphite-300 transition group-hover:translate-x-0.5 group-hover:text-maroon-500 dark:group-hover:text-maroon-400"
                >
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
