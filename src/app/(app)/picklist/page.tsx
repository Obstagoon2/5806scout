"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  aggregateByTeam,
  counterFieldIds,
  type MatchSubmission,
  type TeamAggregate,
} from "@/lib/aggregate";
import type { EventData } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import { MATCH_SCOUT_SECTIONS } from "@/lib/matchScoutSchema";
import {
  moveItem,
  moveToDoNotPick,
  reconcileOrder,
  restoreFromDoNotPick,
  splitDoNotPick,
  toggleStruck,
  type PicklistDoc,
} from "@/lib/picklist";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";

// Reference stat columns: total scored per phase keeps the table readable —
// the Data tab has the full per-goal breakdown.
const AUTO_IDS = counterFieldIds(MATCH_SCOUT_SECTIONS).filter((id) =>
  id.startsWith("autoScored"),
);
const TELEOP_IDS = counterFieldIds(MATCH_SCOUT_SECTIONS).filter((id) =>
  id.startsWith("teleopScored"),
);

function phaseAvg(agg: TeamAggregate | undefined, ids: string[]): number | null {
  if (!agg) return null;
  return ids.reduce((sum, id) => sum + (agg.averages[id] ?? 0), 0);
}

export default function PicklistPage() {
  const { profile } = useAuth();
  const [event, setEvent] = useState<EventData | null>(null);
  const [picklist, setPicklist] = useState<PicklistDoc | null>(null);
  const [submissions, setSubmissions] = useState<MatchSubmission[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    if (!profile) return;
    const teamId = profile.teamId;
    const unsubEvent = onSnapshot(
      doc(db, "teams", teamId, "config", "event"),
      (s) => {
        setEvent(s.exists() ? (s.data() as EventData) : null);
        setLoaded(true);
      },
    );
    const unsubPicklist = onSnapshot(
      doc(db, "teams", teamId, "config", "picklist"),
      (s) => setPicklist(s.exists() ? (s.data() as PicklistDoc) : null),
    );
    const unsubScouting = onSnapshot(
      collection(db, "teams", teamId, "matchScouting"),
      (snapshot) =>
        setSubmissions(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              matchNumber: data.matchNumber as number,
              scoutedTeam: data.scoutedTeam as string,
              alliance: data.alliance as "red" | "blue",
              values: data.values ?? {},
              scoutName: (data.scoutName as string) ?? "",
            };
          }),
        ),
    );
    return () => {
      unsubEvent();
      unsubPicklist();
      unsubScouting();
    };
  }, [profile]);

  const { order, doNotPick } = useMemo(() => {
    if (!event) return { order: [], doNotPick: [] };
    return splitDoNotPick(
      reconcileOrder(picklist?.order ?? [], event.teams),
      picklist?.doNotPick ?? [],
    );
  }, [event, picklist]);
  const struck = useMemo(() => new Set(picklist?.struck ?? []), [picklist]);

  const teamsByNumber = useMemo(
    () => new Map((event?.teams ?? []).map((t) => [t.teamNumber, t])),
    [event],
  );
  const aggregates = useMemo(() => {
    const byTeam = new Map<string, TeamAggregate>();
    for (const agg of aggregateByTeam(MATCH_SCOUT_SECTIONS, submissions)) {
      byTeam.set(agg.team, agg);
    }
    return byTeam;
  }, [submissions]);

  const isAdmin = profile?.role === "admin";

  async function save(
    nextOrder: number[],
    nextStruck: number[],
    nextDoNotPick: number[],
  ) {
    if (!profile) return;
    setSaveError(null);
    try {
      await setDoc(
        doc(db, "teams", profile.teamId, "config", "picklist"),
        makePicklistDoc(nextOrder, nextStruck, nextDoNotPick),
      );
    } catch {
      setSaveError("Could not save the picklist — check your connection.");
    }
  }

  function handleMove(from: number, to: number) {
    void save(moveItem(order, from, to), [...struck], [...doNotPick]);
  }

  function handleDoNotPick(team: number) {
    const next = moveToDoNotPick(order, doNotPick, team);
    void save(next.order, [...struck], next.doNotPick);
  }

  function handleRestore(team: number) {
    const next = restoreFromDoNotPick(order, doNotPick, team);
    void save(next.order, [...struck], next.doNotPick);
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-graphite-900">Picklist</h1>
        <p className="mt-1 text-sm text-graphite-500">
          {isAdmin
            ? "Drag rows (or use the arrows) to rank alliance picks. Tap the team number to strike it once picked."
            : "Live ranking maintained by your admin — updates in real time."}
        </p>
      </div>

      {saveError && (
        <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
          {saveError}
        </p>
      )}

      {loaded && !event && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-12 text-center text-sm text-graphite-500">
          Sync an event on the Event tab first — the picklist ranks the teams at
          your event.
        </div>
      )}

      {event && (
        <div className="overflow-x-auto rounded-lg border border-graphite-200 bg-white">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
                <th className="px-3 py-2.5">Rank</th>
                <th className="px-3 py-2.5">Team</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">EPA</th>
                <th className="px-3 py-2.5">Avg auto</th>
                <th className="px-3 py-2.5">Avg teleop</th>
                <th className="px-3 py-2.5">Endgame</th>
                <th className="px-3 py-2.5">Matches</th>
                {isAdmin && <th className="px-3 py-2.5" aria-label="Reorder" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {order.map((teamNumber, index) => {
                const info = teamsByNumber.get(teamNumber);
                const agg = aggregates.get(String(teamNumber));
                const isStruck = struck.has(teamNumber);
                const auto = phaseAvg(agg, AUTO_IDS);
                const teleop = phaseAvg(agg, TELEOP_IDS);
                return (
                  <tr
                    key={teamNumber}
                    draggable={isAdmin}
                    onDragStart={() => {
                      dragFrom.current = index;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragFrom.current !== null && dragFrom.current !== index) {
                        handleMove(dragFrom.current, index);
                      }
                      dragFrom.current = null;
                    }}
                    className={isStruck ? "bg-graphite-50 opacity-50" : ""}
                  >
                    <td className="font-stat px-3 py-2 font-semibold text-graphite-400">
                      {index + 1}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={!isAdmin}
                        onClick={() =>
                          void save(
                            [...order],
                            toggleStruck([...struck], teamNumber),
                            [...doNotPick],
                          )
                        }
                        className={`font-stat font-semibold ${
                          isStruck ? "line-through" : ""
                        } ${isAdmin ? "hover:text-maroon-600" : ""}`}
                        title={isAdmin ? "Toggle picked/unavailable" : undefined}
                      >
                        {teamNumber}
                      </button>
                    </td>
                    <td className={`px-3 py-2 ${isStruck ? "line-through" : ""}`}>
                      {info?.nickname ?? "—"}
                    </td>
                    <td className="font-stat px-3 py-2">
                      {info?.epa != null ? info.epa.toFixed(1) : "—"}
                    </td>
                    <td className="font-stat px-3 py-2">
                      {auto !== null && agg ? auto.toFixed(1) : "—"}
                    </td>
                    <td className="font-stat px-3 py-2">
                      {teleop !== null && agg ? teleop.toFixed(1) : "—"}
                    </td>
                    <td className="px-3 py-2 text-graphite-600">
                      {agg?.modes.endgame ?? "—"}
                    </td>
                    <td className="font-stat px-3 py-2">{agg?.matches ?? 0}</td>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <span className="flex gap-1">
                          <button
                            type="button"
                            aria-label={`Move ${teamNumber} up`}
                            disabled={index === 0}
                            onClick={() => handleMove(index, index - 1)}
                            className="rounded border border-graphite-200 px-2 py-1 text-xs text-graphite-600 transition hover:border-graphite-300 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${teamNumber} down`}
                            disabled={index === order.length - 1}
                            onClick={() => handleMove(index, index + 1)}
                            className="rounded border border-graphite-200 px-2 py-1 text-xs text-graphite-600 transition hover:border-graphite-300 disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${teamNumber} to Do Not Pick`}
                            onClick={() => handleDoNotPick(teamNumber)}
                            className="rounded border border-maroon-200 px-2 py-1 text-xs font-medium text-maroon-700 transition hover:border-maroon-400"
                            title="Move to Do Not Pick"
                          >
                            DNP
                          </button>
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {event && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold text-graphite-900">
              Do Not Pick
            </h2>
            <p className="mt-0.5 text-sm text-graphite-500">
              Teams your team has decided not to pick — kept out of the ranking
              above.
            </p>
          </div>
          {doNotPick.length === 0 ? (
            <p className="rounded-lg border border-dashed border-graphite-300 bg-white px-4 py-6 text-center text-sm text-graphite-500">
              No teams marked Do Not Pick.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-maroon-200 bg-white">
              <table className="w-full min-w-max text-left text-sm">
                <thead>
                  <tr className="border-b border-maroon-100 text-xs uppercase tracking-wider text-graphite-500">
                    <th className="px-3 py-2.5">Team</th>
                    <th className="px-3 py-2.5">Name</th>
                    <th className="px-3 py-2.5">EPA</th>
                    <th className="px-3 py-2.5">Avg auto</th>
                    <th className="px-3 py-2.5">Avg teleop</th>
                    <th className="px-3 py-2.5">Matches</th>
                    {isAdmin && <th className="px-3 py-2.5" aria-label="Restore" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-graphite-100">
                  {doNotPick.map((teamNumber) => {
                    const info = teamsByNumber.get(teamNumber);
                    const agg = aggregates.get(String(teamNumber));
                    const auto = phaseAvg(agg, AUTO_IDS);
                    const teleop = phaseAvg(agg, TELEOP_IDS);
                    return (
                      <tr key={teamNumber} className="bg-maroon-50/40">
                        <td className="font-stat px-3 py-2 font-semibold">
                          {teamNumber}
                        </td>
                        <td className="px-3 py-2">{info?.nickname ?? "—"}</td>
                        <td className="font-stat px-3 py-2">
                          {info?.epa != null ? info.epa.toFixed(1) : "—"}
                        </td>
                        <td className="font-stat px-3 py-2">
                          {auto !== null && agg ? auto.toFixed(1) : "—"}
                        </td>
                        <td className="font-stat px-3 py-2">
                          {teleop !== null && agg ? teleop.toFixed(1) : "—"}
                        </td>
                        <td className="font-stat px-3 py-2">{agg?.matches ?? 0}</td>
                        {isAdmin && (
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => handleRestore(teamNumber)}
                              className="rounded border border-graphite-200 px-2.5 py-1 text-xs font-medium text-graphite-600 transition hover:border-graphite-300"
                            >
                              Restore
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// Module scope so the React compiler's purity rule doesn't treat the
// Date.now() call as render-time work — save() only runs from handlers.
function makePicklistDoc(
  order: number[],
  struck: number[],
  doNotPick: number[],
): PicklistDoc {
  return { order, struck, doNotPick, updatedAt: Date.now() };
}
