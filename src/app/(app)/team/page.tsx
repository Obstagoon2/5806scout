"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  assignMatchScouts,
  assignPitScouts,
  type MatchAssignmentsDoc,
  type PitAssignmentsDoc,
} from "@/lib/assignments";
import type { EventData } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import type { Team, UserProfile } from "@/lib/types";
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useState } from "react";

export default function TeamPage() {
  const { profile, user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [roster, setRoster] = useState<UserProfile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [hasPitAssignments, setHasPitAssignments] = useState(false);
  const [hasMatchAssignments, setHasMatchAssignments] = useState(false);
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

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
    const unsubEvent = onSnapshot(doc(db, "teams", teamId, "config", "event"), (s) => {
      setEvent(s.exists() ? (s.data() as EventData) : null);
    });
    const unsubPit = onSnapshot(
      doc(db, "teams", teamId, "config", "pitAssignments"),
      (s) => setHasPitAssignments(s.exists()),
    );
    const unsubMatch = onSnapshot(
      doc(db, "teams", teamId, "config", "matchAssignments"),
      (s) => setHasMatchAssignments(s.exists()),
    );
    return () => {
      unsubTeam();
      unsubRoster();
      unsubEvent();
      unsubPit();
      unsubMatch();
    };
  }, [profile]);

  const isAdmin = profile?.role === "admin";
  const activeScouts = roster.filter((m) => m.role === "scout" && m.active);

  function scoutNames(): Record<string, string> {
    return Object.fromEntries(activeScouts.map((m) => [m.uid, m.fullName]));
  }

  async function handleAssignPit() {
    if (!profile || !event) return;
    if (
      hasPitAssignments &&
      !window.confirm(
        "Pit scouting assignments already exist. Replace them with a fresh random assignment?",
      )
    ) {
      return;
    }
    setError(null);
    setAssignSuccess(null);
    try {
      const byScout = assignPitScouts(
        event.teams.map((t) => t.teamNumber),
        activeScouts.map((m) => m.uid),
      );
      const payload: PitAssignmentsDoc = {
        byScout,
        scoutNames: scoutNames(),
        generatedAt: Date.now(),
      };
      await setDoc(
        doc(db, "teams", profile.teamId, "config", "pitAssignments"),
        payload,
      );
      setAssignSuccess(
        `Pit scouting: ${event.teams.length} teams split across ${activeScouts.length} scouts — see the Assignments tab.`,
      );
    } catch {
      setError("Could not save pit assignments — check your connection.");
    }
  }

  async function handleAssignMatch() {
    if (!profile || !event) return;
    if (
      hasMatchAssignments &&
      !window.confirm(
        "Match scouting assignments already exist. Replace them with a fresh random assignment?",
      )
    ) {
      return;
    }
    setError(null);
    setAssignSuccess(null);
    try {
      const slots = assignMatchScouts(
        event.matches,
        activeScouts.map((m) => m.uid),
      );
      const payload: MatchAssignmentsDoc = {
        slots,
        scoutNames: scoutNames(),
        generatedAt: Date.now(),
      };
      await setDoc(
        doc(db, "teams", profile.teamId, "config", "matchAssignments"),
        payload,
      );
      setAssignSuccess(
        `Match scouting: ${event.matches.length} matches covered by ${activeScouts.length} scouts — see the Assignments tab.`,
      );
    } catch {
      setError("Could not save match assignments — check your connection.");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setInviteSuccess(null);
    setInviteSending(true);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/invite-scout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ fullName: inviteName, email: inviteEmail }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: string; invited?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? "Could not send the invite.");
        return;
      }
      setInviteSuccess(
        `Invite sent to ${body?.invited ?? inviteEmail} — they'll get an email to set their password.`,
      );
      setInviteName("");
      setInviteEmail("");
      setShowInvite(false);
    } catch {
      setError("Could not send the invite — check your connection.");
    } finally {
      setInviteSending(false);
    }
  }

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

      {isAdmin && (
        <div className="flex flex-col gap-2 rounded-lg border border-graphite-200 bg-white p-4">
          <p className="text-sm font-medium text-graphite-900">
            Scouting assignments
          </p>
          <p className="text-xs text-graphite-500">
            {event
              ? `Randomly split the ${event.teams.length} event teams (pit) or all ${event.matches.length} matches (match) across the ${activeScouts.length} active scout${activeScouts.length === 1 ? "" : "s"}. Results appear in the Assignments tab.`
              : "Sync an event on the Event tab first."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!event || activeScouts.length === 0 || event.teams.length === 0}
              onClick={() => void handleAssignPit()}
              className="rounded-md bg-maroon-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
            >
              Assign Pit Scout
            </button>
            <button
              type="button"
              disabled={!event || activeScouts.length === 0 || event.matches.length === 0}
              onClick={() => void handleAssignMatch()}
              className="rounded-md bg-maroon-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
            >
              Assign Match Scout
            </button>
          </div>
          {event && activeScouts.length === 0 && (
            <p className="text-xs text-amber-700">
              No active members with the scout role — add or reactivate scouts
              below.
            </p>
          )}
        </div>
      )}

      {assignSuccess && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {assignSuccess}
        </p>
      )}

      {isAdmin && (
        <div className="flex flex-col gap-3">
          {!showInvite && (
            <button
              type="button"
              onClick={() => {
                setShowInvite(true);
                setInviteSuccess(null);
              }}
              className="self-start rounded-md bg-maroon-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700"
            >
              Add scout
            </button>
          )}
          {showInvite && (
            <form
              onSubmit={handleInvite}
              className="flex flex-col gap-3 rounded-lg border border-graphite-200 bg-white p-4"
            >
              <p className="text-sm font-medium text-graphite-900">
                Add a scout
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-graphite-700">
                  Full name
                </span>
                <input
                  required
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm text-graphite-900 outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-graphite-700">
                  Email
                </span>
                <input
                  required
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm text-graphite-900 outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100"
                />
              </label>
              <p className="text-xs text-graphite-500">
                They&apos;ll get an email inviting them to set a password and
                log in.
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={inviteSending}
                  className="rounded-md bg-maroon-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
                >
                  {inviteSending ? "Sending invite…" : "Send invite"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="rounded-md border border-graphite-200 px-4 py-2 text-sm font-medium text-graphite-600 transition hover:border-graphite-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {inviteSuccess && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {inviteSuccess}
        </p>
      )}

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
