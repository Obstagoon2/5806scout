"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  completedLast,
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
  const { profile, user, dataTeamId } = useAuth();
  const [view, setView] = useState<View>("pit");
  const [pitDoc, setPitDoc] = useState<PitAssignmentsDoc | null>(null);
  const [matchDoc, setMatchDoc] = useState<MatchAssignmentsDoc | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Assignments live in the shared store — a sister pair sees one set.
    if (!dataTeamId) return;
    const teamId = dataTeamId;
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
  }, [dataTeamId]);

  const isAdmin = profile?.role === "admin";
  const nicknames = useMemo(
    () => new Map((event?.teams ?? []).map((t) => [t.teamNumber, t.nickname])),
    [event],
  );

  // Cross-off toggles use arrayUnion/arrayRemove so two scouts tapping at
  // the same time never clobber each other's marks.
  async function togglePitTeam(team: number, done: boolean): Promise<void> {
    if (!dataTeamId) return;
    try {
      await updateDoc(
        doc(db, "teams", dataTeamId, "config", "pitAssignments"),
        { completedTeams: done ? arrayRemove(team) : arrayUnion(team) },
      );
    } catch {
      // Chip stays as-is if the write fails — the scout can tap again.
    }
  }

  async function toggleMatchSlot(key: string, done: boolean): Promise<void> {
    if (!dataTeamId) return;
    try {
      await updateDoc(
        doc(db, "teams", dataTeamId, "config", "matchAssignments"),
        { completedSlots: done ? arrayRemove(key) : arrayUnion(key) },
      );
    } catch {
      // Row stays as-is if the write fails — the scout can tap again.
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          Assignments
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          {isAdmin
            ? "Everyone's scouting assignments — generate them from the Team tab."
            : "Your pit and match scouting assignments, set by your admin."}
        </p>
      </div>

      <div className="surface-card flex w-fit p-0.5">
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
    <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
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
      <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
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
          className="surface-card p-4"
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
              {completedLast(teams, (t) => completed.has(t)).map((t) => {
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
                      <span className="stat font-semibold">{t}</span>
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
      <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
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
      <div className="surface-card overflow-x-auto">
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
            {completedLast(slots, (slot) =>
              completed.has(slotKey(slot)),
            ).map((slot) => {
              const key = slotKey(slot);
              const done = completed.has(key);
              const canToggle = isAdmin || slot.uid === myUid;
              return (
                <tr
                  key={`${slot.matchKey}-${slot.teamNumber}`}
                  className={`transition ${done ? "bg-graphite-50 opacity-50" : "hover:bg-graphite-50"}`}
                >
                  <td className="stat px-3 py-2 font-semibold">
                    {COMP_LEVEL_LABELS[slot.compLevel] ?? slot.compLevel}
                    {slot.matchNumber}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={!canToggle}
                      onClick={() => void onToggle(key, done)}
                      title={canToggle ? "Tap to cross off / restore" : undefined}
                      className={`stat font-semibold ${done ? "line-through" : ""} ${
                        canToggle ? "hover:text-maroon-600 dark:hover:text-maroon-400" : ""
                      }`}
                    >
                      {slot.teamNumber}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        slot.alliance === "red" ? "text-maroon-700 dark:text-maroon-300" : "text-sky-700 dark:text-sky-300"
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
