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

// A scout's own assignments, shown at the top of the form they'd scout them
// with — the work list and the form live on one screen instead of a separate
// tab. Crossed-off entries sink to the bottom so what's left is always first.
// The admin-wide view of everyone's assignments stays at /assignments.

/** Cross-off writes use arrayUnion/arrayRemove so two scouts marking at the
 *  same time never clobber each other. */
async function toggleCompleted(
  teamId: string,
  docId: "pitAssignments" | "matchAssignments",
  fieldName: "completedTeams" | "completedSlots",
  entry: number | string,
  done: boolean,
): Promise<void> {
  try {
    await updateDoc(doc(db, "teams", teamId, "config", docId), {
      [fieldName]: done ? arrayRemove(entry) : arrayUnion(entry),
    });
  } catch {
    // The chip stays as-is if the write fails — the scout can tap again.
  }
}

function Panel({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card flex flex-col gap-3 p-4">
      <h2 className="flex items-baseline justify-between gap-2">
        <span className="section-title">{title}</span>
        <span className="stat text-xs text-graphite-500">{count}</span>
      </h2>
      {children}
    </section>
  );
}

/**
 * The signed-in scout's pit assignments. Tapping a team number opens its form
 * via `onOpenTeam`; the checkbox crosses it off.
 */
export function MyPitAssignments({
  activeTeam,
  onOpenTeam,
}: {
  activeTeam: string | null;
  onOpenTeam: (teamNumber: string) => void;
}) {
  const { user, dataTeamId } = useAuth();
  const [pitDoc, setPitDoc] = useState<PitAssignmentsDoc | null>(null);
  const [event, setEvent] = useState<EventData | null>(null);

  useEffect(() => {
    // Assignments live in the shared store — a sister pair sees one set.
    if (!dataTeamId) return;
    const teamId = dataTeamId;
    const unsubPit = onSnapshot(
      doc(db, "teams", teamId, "config", "pitAssignments"),
      (s) => setPitDoc(s.exists() ? (s.data() as PitAssignmentsDoc) : null),
    );
    const unsubEvent = onSnapshot(
      doc(db, "teams", teamId, "config", "event"),
      (s) => setEvent(s.exists() ? (s.data() as EventData) : null),
    );
    return () => {
      unsubPit();
      unsubEvent();
    };
  }, [dataTeamId]);

  const nicknames = useMemo(
    () => new Map((event?.teams ?? []).map((t) => [t.teamNumber, t.nickname])),
    [event],
  );

  const myTeams = pitDoc?.byScout[user?.uid ?? ""];
  if (!dataTeamId || !pitDoc || !myTeams || myTeams.length === 0) return null;

  const completed = new Set(pitDoc.completedTeams ?? []);
  const ordered = completedLast(myTeams, (team) => completed.has(team));
  const left = myTeams.filter((team) => !completed.has(team)).length;

  return (
    <Panel
      title="Your pit assignments"
      count={`${left} left of ${myTeams.length}`}
    >
      <ul className="flex flex-wrap gap-2">
        {ordered.map((team) => {
          const done = completed.has(team);
          const isActive = String(team) === activeTeam;
          return (
            <li
              key={team}
              className={`flex items-center gap-2 rounded-md border px-2 py-1 transition ${
                done
                  ? "border-graphite-200 bg-graphite-50 opacity-60"
                  : isActive
                    ? "border-maroon-600 bg-maroon-50 dark:bg-maroon-950/30"
                    : "border-graphite-200 bg-surface"
              }`}
            >
              <input
                type="checkbox"
                checked={done}
                onChange={() =>
                  void toggleCompleted(
                    dataTeamId,
                    "pitAssignments",
                    "completedTeams",
                    team,
                    done,
                  )
                }
                aria-label={`${done ? "Restore" : "Cross off"} team ${team}`}
                className="h-4 w-4 shrink-0 accent-maroon-600"
              />
              <button
                type="button"
                onClick={() => onOpenTeam(String(team))}
                className={`text-left text-sm ${done ? "line-through" : ""}`}
              >
                <span className="stat font-semibold text-graphite-900">
                  {team}
                </span>
                {nicknames.get(team) && (
                  <span className="ml-1.5 text-graphite-500">
                    {nicknames.get(team)}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {left === 0 && (
        <p className="text-xs text-graphite-500">
          Every assigned robot is scouted — nice work.
        </p>
      )}
    </Panel>
  );
}

/**
 * The signed-in scout's match slots. Tapping a row loads that match, team and
 * alliance into the form via `onPick`; the checkbox crosses it off.
 */
export function MyMatchAssignments({
  onPick,
}: {
  onPick: (slot: MatchSlot) => void;
}) {
  const { user, dataTeamId } = useAuth();
  const [matchDoc, setMatchDoc] = useState<MatchAssignmentsDoc | null>(null);

  useEffect(() => {
    if (!dataTeamId) return;
    return onSnapshot(
      doc(db, "teams", dataTeamId, "config", "matchAssignments"),
      (s) => setMatchDoc(s.exists() ? (s.data() as MatchAssignmentsDoc) : null),
    );
  }, [dataTeamId]);

  const mySlots = useMemo(
    () => (matchDoc?.slots ?? []).filter((s) => s.uid === user?.uid),
    [matchDoc, user],
  );

  if (!dataTeamId || !matchDoc || mySlots.length === 0) return null;

  const completed = new Set(matchDoc.completedSlots ?? []);
  const ordered = completedLast(mySlots, (slot) => completed.has(slotKey(slot)));
  const left = mySlots.filter((slot) => !completed.has(slotKey(slot))).length;

  return (
    <Panel
      title="Your match assignments"
      count={`${left} left of ${mySlots.length}`}
    >
      <ul className="flex max-h-72 flex-col divide-y divide-graphite-100 overflow-y-auto">
        {ordered.map((slot) => {
          const key = slotKey(slot);
          const done = completed.has(key);
          return (
            <li key={key} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={done}
                onChange={() =>
                  void toggleCompleted(
                    dataTeamId,
                    "matchAssignments",
                    "completedSlots",
                    key,
                    done,
                  )
                }
                aria-label={`${done ? "Restore" : "Cross off"} team ${slot.teamNumber} in match ${slot.matchNumber}`}
                className="h-4 w-4 shrink-0 accent-maroon-600"
              />
              <button
                type="button"
                onClick={() => onPick(slot)}
                className={`flex flex-1 items-center gap-3 text-left text-sm transition hover:text-maroon-700 dark:hover:text-maroon-300 ${
                  done ? "text-graphite-400 line-through" : "text-graphite-900"
                }`}
              >
                <span className="stat w-14 font-semibold">
                  {COMP_LEVEL_LABELS[slot.compLevel] ?? slot.compLevel}
                  {slot.matchNumber}
                </span>
                <span className="stat font-semibold">{slot.teamNumber}</span>
                <span
                  className={`ml-auto text-xs uppercase tracking-wider ${
                    slot.alliance === "red"
                      ? "text-maroon-700 dark:text-maroon-300"
                      : "text-sky-700 dark:text-sky-300"
                  }`}
                >
                  {slot.alliance}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
