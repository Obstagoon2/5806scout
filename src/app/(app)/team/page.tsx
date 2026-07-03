"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import type { Team, UserProfile } from "@/lib/types";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";

export default function TeamPage() {
  const { profile, user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const teamId = profile.teamId;
    const unsubTeam = onSnapshot(doc(db, "teams", teamId), (s) => {
      setTeam(s.exists() ? (s.data() as Team) : null);
    });
    const unsubRoster = onSnapshot(
      query(collection(db, "users"), where("teamId", "==", teamId)),
      (snapshot) =>
        setRoster(
          snapshot.docs
            .map((d) => {
              const data = d.data();
              return {
                uid: d.id,
                email: (data.email as string) ?? "",
                fullName: (data.fullName as string) ?? "",
                teamId: (data.teamId as string) ?? "",
                role: (data.role as UserProfile["role"]) ?? "scout",
                active: (data.active as boolean) ?? true,
              };
            })
            .sort((a, b) => a.fullName.localeCompare(b.fullName)),
        ),
    );
    return () => {
      unsubTeam();
      unsubRoster();
    };
  }, [profile]);

  const isAdmin = profile?.role === "admin";

  async function toggleActive(member: UserProfile) {
    if (!profile) return;
    setError(null);
    try {
      await updateDoc(doc(db, "users", member.uid), { active: !member.active });
    } catch {
      setError("Could not update that scout — check your connection.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-graphite-900">
          Team {team?.teamNumber ?? profile?.teamId}
          {team?.teamName && team.teamName !== team.teamNumber
            ? ` — ${team.teamName}`
            : ""}
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          {roster.length} member{roster.length === 1 ? "" : "s"}.{" "}
          {isAdmin
            ? "Deactivated scouts keep their account but should hand off duties."
            : "Admin access is granted by promoting a user in the Firebase console."}
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
          {error}
        </p>
      )}

      <ul className="divide-y divide-graphite-100 rounded-lg border border-graphite-200 bg-white">
        {roster.map((member) => (
          <li
            key={member.uid}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className={member.active ? "" : "opacity-50"}>
              <p className="text-sm font-medium text-graphite-900">
                {member.fullName}
                {member.uid === user?.uid && (
                  <span className="ml-1.5 text-xs text-graphite-400">(you)</span>
                )}
              </p>
              <p className="text-xs text-graphite-500">{member.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                  member.role === "admin"
                    ? "bg-maroon-50 text-maroon-700"
                    : "bg-graphite-100 text-graphite-600"
                }`}
              >
                {member.role}
              </span>
              {!member.active && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                  inactive
                </span>
              )}
              {isAdmin && member.uid !== user?.uid && (
                <button
                  type="button"
                  onClick={() => void toggleActive(member)}
                  className="rounded-md border border-graphite-200 px-2.5 py-1 text-xs font-medium text-graphite-600 transition hover:border-graphite-300"
                >
                  {member.active ? "Deactivate" : "Reactivate"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
