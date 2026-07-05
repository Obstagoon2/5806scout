"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  slotKey,
  type MatchAssignmentsDoc,
  type MatchSlot,
  type PitAssignmentsDoc,
} from "@/lib/assignments";
import type { EventData } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import { COMP_LEVEL_LABELS } from "@/lib/pitDashboard";
import {
  arrayRemove,
  arrayUnion,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

type View = "pit" | "match";

export default function AssignmentsPage() {
  const { profile, user } = useAuth();
  const [view, setView] = useState<View>("pit");
  const [pitDoc, setPitDoc] = useState<PitAssignmentsDoc | null>(null);
  const [matchDoc, setMatchDoc] = useState<MatchAssignmentsDoc | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile) return;
    const teamId = profile.teamId;
    const unsubPit = onSnapshot(
      doc(db, "teams", teamId, "config", "pitAssignments"),
      (s) => {
        setPitDoc(s.exists() ? (s.data() as PitAssignmentsDoc) : null);
        setLoaded(true);
      },
    );
    const unsubMatch = onSnapshot(
      doc(db, "teams", teamId, "config", "matchAssignments"),
      (s) => setMatchDoc(s.exists() ? (s.data() as MatchAssignmentsDoc) : null),
    );
    const unsubEvent = onSnapshot(doc(db, "teams", teamId, "config", "event"), (s) =>
      setEvent(s.exists() ? (s.data() as EventData) : null),
    );
    return () => {
      unsubPit();
      unsubMatch();
      unsubEvent();
    };
  }, [profile]);

  const isAdmin = profile?.role === "admin";
  const nicknames = useMemo(
    () => new Map((event?.teams ?? []).map((t) => [t.teamNumber, t.nickname])),
    [event],
  );

  // Cross-off toggles use arrayUnion/arrayRemove so two scouts tapping at
  // the same time never clobber each other's marks.
  async function togglePitTeam(team: number, done: boolean): Promise<void> {
    if (!profile) return;
    try {
      await updateDoc(
        doc(db, "teams", profile.teamId, "config", "pitAssignments"),
        { completedTeams: done ? arrayRemove(team) : arrayUnion(team) },
      );
    } catch {
      // Chip stays as-is if the write fails — the scout can tap again.
    }
  }

  async function toggleMatchSlot(key: string, done: boolean): Promise<void> {
    if (!profile) return;
    try {
      await updateDoc(
        doc(db, "teams", profile.teamId, "config", "matchAssignments"),
        { completedSlots: done ? arrayRemove(key) : arrayUnion(key) },
      );
    } catch {
      // Row stays as-is if the write fails — the scout can tap again.
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-graphite-900">Assignments</h1>
        <p className="mt-1 text-sm text-graphite-500">
          {isAdmin
            ? "Everyone's scouting assignments — generate them from the Team tab."
            : "Your pit and match scouting assignments, set by your admin."}
        </p>
      </div>

      <div className="flex w-fit rounded-md border border-graphite-200 bg-white p-0.5">
        {(["pit", "match"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded px-3.5 py-1.5 text-sm font-medium transition ${
              view === v
                ? "bg-maroon-600 text-white"
                : "text-graphite-600 hover:text-graphite-900"
            }`}
          >
            {v === "pit" ? "Pit scouting" : "Match scouting"}
          </button>
        ))}
      </div>

      {view === "pit" &&
        (pitDoc ? (
          <PitView
            pitDoc={pitDoc}
            nicknames={nicknames}
            isAdmin={isAdmin}
            myUid={user?.uid ?? ""}
            onToggle={togglePitTeam}
          />
        ) : (
          loaded && <Empty kind="pit" isAdmin={isAdmin} />
        ))}

      {view === "match" &&
        (matchDoc ? (
          <MatchView
            matchDoc={matchDoc}
            isAdmin={isAdmin}
            myUid={user?.uid ?? ""}
            onToggle={toggleMatchSlot}
          />
        ) : (
          loaded && <Empty kind="match" isAdmin={isAdmin} />
        ))}
    </main>
  );
}

function Empty({ kind, isAdmin }: { kind: View; isAdmin: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-12 text-center text-sm text-graphite-500">
      No {kind} scouting assignments yet.
      {isAdmin
        ? ` Press “Assign ${kind === "pit" ? "Pit" : "Match"} Scout” on the Team tab.`
        : " Your admin hasn't generated them yet."}
    </div>
  );
}

function PitView({
  pitDoc,
  nicknames,
  isAdmin,
  myUid,
  onToggle,
}: {
  pitDoc: PitAssignmentsDoc;
  nicknames: Map<number, string>;
  isAdmin: boolean;
  myUid: string;
  onToggle: (team: number, done: boolean) => Promise<void>;
}) {
  const completed = new Set(pitDoc.completedTeams ?? []);
  const entries = isAdmin
    ? Object.entries(pitDoc.byScout).sort((a, b) =>
        (pitDoc.scoutNames[a[0]] ?? "").localeCompare(pitDoc.scoutNames[b[0]] ?? ""),
      )
    : Object.entries(pitDoc.byScout).filter(([uid]) => uid === myUid);

  if (!isAdmin && entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-12 text-center text-sm text-graphite-500">
        You have no pit scouting assignments in the current set.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-graphite-400">
        Generated {new Date(pitDoc.generatedAt).toLocaleString()}.
      </p>
      {entries.map(([uid, teams]) => (
        <section
          key={uid}
          className="rounded-lg border border-graphite-200 bg-white p-4"
        >
          {isAdmin && (
            <h2 className="mb-2 text-sm font-semibold text-graphite-900">
              {pitDoc.scoutNames[uid] ?? uid}
              <span className="ml-1.5 font-normal text-graphite-400">
                — {teams.length} team{teams.length === 1 ? "" : "s"}
              </span>
            </h2>
          )}
          {teams.length === 0 ? (
            <p className="text-sm text-graphite-500">No teams assigned.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {teams.map((t) => {
                const done = completed.has(t);
                // Scouts cross off their own teams; admins can fix anyone's.
                const canToggle = isAdmin || uid === myUid;
                return (
                  <li key={t}>
                    <button
                      type="button"
                      disabled={!canToggle}
                      onClick={() => void onToggle(t, done)}
                      title={canToggle ? "Tap to cross off / restore" : undefined}
                      className={`rounded-md border px-2.5 py-1 text-left text-sm transition ${
                        done
                          ? "border-green-100 bg-green-100/60 line-through opacity-60"
                          : "border-graphite-200 bg-graphite-50"
                      } ${canToggle ? "hover:border-maroon-400" : ""}`}
                    >
                      <span className="font-stat font-semibold">{t}</span>
                      {nicknames.get(t) && (
                        <span className="ml-1.5 text-graphite-500">
                          {nicknames.get(t)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function MatchView({
  matchDoc,
  isAdmin,
  myUid,
  onToggle,
}: {
  matchDoc: MatchAssignmentsDoc;
  isAdmin: boolean;
  myUid: string;
  onToggle: (key: string, done: boolean) => Promise<void>;
}) {
  const slots: MatchSlot[] = isAdmin
    ? matchDoc.slots
    : matchDoc.slots.filter((s) => s.uid === myUid);
  const completed = new Set(matchDoc.completedSlots ?? []);

  if (slots.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-12 text-center text-sm text-graphite-500">
        {isAdmin
          ? "The current set has no match slots — re-generate from the Team tab."
          : "You have no match scouting assignments in the current set."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-graphite-400">
        Generated {new Date(matchDoc.generatedAt).toLocaleString()}.
        {isAdmin ? "" : " Scout the listed team for each match."}
      </p>
      <div className="overflow-x-auto rounded-lg border border-graphite-200 bg-white">
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
              <th className="px-3 py-2.5">Match</th>
              <th className="px-3 py-2.5">Team</th>
              <th className="px-3 py-2.5">Alliance</th>
              {isAdmin && <th className="px-3 py-2.5">Scout</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-graphite-100">
            {slots.map((slot) => {
              const key = slotKey(slot);
              const done = completed.has(key);
              const canToggle = isAdmin || slot.uid === myUid;
              return (
                <tr
                  key={`${slot.matchKey}-${slot.teamNumber}`}
                  className={done ? "bg-graphite-50 opacity-50" : ""}
                >
                  <td className="font-stat px-3 py-2 font-semibold">
                    {COMP_LEVEL_LABELS[slot.compLevel] ?? slot.compLevel}
                    {slot.matchNumber}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!canToggle}
                      onClick={() => void onToggle(key, done)}
                      title={canToggle ? "Tap to cross off / restore" : undefined}
                      className={`font-stat font-semibold ${done ? "line-through" : ""} ${
                        canToggle ? "hover:text-maroon-600" : ""
                      }`}
                    >
                      {slot.teamNumber}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        slot.alliance === "red" ? "text-maroon-700" : "text-sky-700"
                      }
                    >
                      {slot.alliance}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      {matchDoc.scoutNames[slot.uid] ?? slot.uid}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
