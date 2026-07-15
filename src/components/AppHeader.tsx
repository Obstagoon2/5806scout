"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import { LionMark } from "@/components/LionMark";

export function AppHeader() {
  const { profile } = useAuth();

  return (
    <header className="border-b border-graphite-900">
      <div className="hazard-stripe h-1" />
      <div className="flex items-center justify-between bg-maroon-700 px-4 py-3 text-white md:px-6">
        <Link href="/home" className="flex items-center gap-2.5">
          <LionMark className="h-7 w-7 text-white" />
          <span className="flex items-baseline gap-2">
            <span className="text-base font-semibold tracking-tight">
              FRC Scouting
            </span>
            {profile && (
              <span className="stat text-sm text-maroon-100">
                #{profile.teamId}
              </span>
            )}
          </span>
        </Link>

        {profile && (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-maroon-100 sm:inline">
              {profile.fullName}
              {profile.role === "admin" && (
                <span className="badge badge-admin ml-1.5">Admin</span>
              )}
            </span>
            <button
              onClick={() => signOut(auth)}
              className="rounded-md border border-maroon-300/40 px-2.5 py-1.5 text-xs font-medium text-white transition hover:border-maroon-300/70 hover:bg-maroon-800 active:bg-maroon-900"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
