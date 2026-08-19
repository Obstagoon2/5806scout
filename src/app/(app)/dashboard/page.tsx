"use client";

import { AdminDashboard } from "@/components/AdminDashboard";
import { ScoutDashboard } from "@/components/ScoutDashboard";
import { useAuth } from "@/lib/auth/AuthProvider";

// One tab, two views that never overlap: a scout gets their own work list, an
// admin gets the crew-wide picture. Which one you see follows your role, so
// neither has to scroll past the other's screen to find their own.

export default function DashboardPage() {
  const { profile, loading } = useAuth();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 md:px-6">
      {loading || !profile ? (
        <p className="text-sm text-graphite-500">Loading your dashboard…</p>
      ) : profile.role === "admin" ? (
        <AdminDashboard />
      ) : (
        <ScoutDashboard />
      )}
    </main>
  );
}
