"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";

export function AppHeader() {
  const { profile } = useAuth();

  return (
    <header className="flex items-center justify-between border-b border-graphite-200 bg-maroon-700 px-4 py-3 text-white md:px-6">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold tracking-tight">FRC Scouting</span>
        {profile && (
          <span className="font-stat text-sm text-maroon-100">#{profile.teamId}</span>
        )}
      </div>

      {profile && (
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-maroon-100 sm:inline">
            {profile.fullName}
            {profile.role === "admin" && (
              <span className="ml-1.5 rounded bg-maroon-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                Admin
              </span>
            )}
          </span>
          <button
            onClick={() => signOut(auth)}
            className="rounded-md border border-maroon-300/40 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-maroon-800"
          >
            Log out
          </button>
        </div>
      )}
    </header>
  );
}
