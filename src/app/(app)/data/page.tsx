"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  aggregateByTeam,
  counterFieldIds,
  type MatchSubmission,
} from "@/lib/aggregate";
import { useScoutForms } from "@/lib/useScoutForms";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

type View = "raw" | "teams";

export default function DataPage() {
  const { dataTeamId } = useAuth();
  // Columns follow this team's customized schema, not the static defaults.
  const { matchSections } = useScoutForms();
  const [view, setView] = useState<View>("raw");
  const [submissions, setSubmissions] = useState<MatchSubmission[]>([]);
  const [teamFilter, setTeamFilter] = useState("");
  const [scoutFilter, setScoutFilter] = useState("");

  useEffect(() => {
    // Reads the shared store so a sister pair analyzes pooled data.
    if (!dataTeamId) return;
    return onSnapshot(
      query(
        collection(db, "teams", dataTeamId, "matchScouting"),
        orderBy("matchNumber", "asc"),
      ),
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
  }, [dataTeamId]);

  const filtered = useMemo(
    () =>
      submissions.filter(
        (s) =>
          (!teamFilter.trim() || s.scoutedTeam.includes(teamFilter.trim())) &&
          (!scoutFilter.trim() ||
            s.scoutName.toLowerCase().includes(scoutFilter.trim().toLowerCase())),
      ),
    [submissions, teamFilter, scoutFilter],
  );

  // Label lookup for counter/select columns, from the schema itself.
  const fieldLabels = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        matchSections.flatMap((s) =>
          s.fields.map((f) => [f.id, `${s.title}: ${f.label}`]),
        ),
      ),
    [matchSections],
  );
  const counterIds = useMemo(
    () => counterFieldIds(matchSections),
    [matchSections],
  );

  const aggregates = useMemo(
    () => aggregateByTeam(matchSections, submissions),
    [matchSections, submissions],
  );

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
            <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
            Data
          </h1>
          <p className="mt-1 text-sm text-graphite-500">
            {submissions.length} match submission{submissions.length === 1 ? "" : "s"} —
            updates live.
          </p>
        </div>
        <div className="surface-card flex p-0.5">
          {(["raw", "teams"] as const).map((v) => (
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
              {v === "raw" ? "Raw" : "By Team"}
            </button>
          ))}
        </div>
      </div>

      {view === "raw" && (
        <>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="Filter team #"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="field-input stat w-36"
            />
            <input
              type="text"
              placeholder="Filter scout"
              value={scoutFilter}
              onChange={(e) => setScoutFilter(e.target.value)}
              className="field-input w-36"
            />
          </div>

          <div className="surface-card overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
                  <th className="px-3 py-2.5">Match</th>
                  <th className="px-3 py-2.5">Team</th>
                  <th className="px-3 py-2.5">Alliance</th>
                  {counterIds.map((id) => (
                    <th key={id} className="px-3 py-2.5">
                      {fieldLabels[id]}
                    </th>
                  ))}
                  <th className="px-3 py-2.5">Scout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-graphite-100">
                {filtered.map((s) => (
                  <tr key={s.id} className="transition hover:bg-graphite-50">
                    <td className="stat px-3 py-2">Q{s.matchNumber}</td>
                    <td className="stat px-3 py-2">{s.scoutedTeam}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${
                          s.alliance === "red"
                            ? "bg-maroon-50 text-maroon-700 dark:text-maroon-300"
                            : "bg-sky-50 text-sky-700 dark:text-sky-300"
                        }`}
                      >
                        {s.alliance}
                      </span>
                    </td>
                    {counterIds.map((id) => (
                      <td key={id} className="stat px-3 py-2">
                        {typeof s.values[id] === "number" ? (s.values[id] as number) : 0}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-graphite-500">{s.scoutName}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={4 + counterIds.length}
                      className="px-3 py-8 text-center text-graphite-400"
                    >
                      No submissions{submissions.length > 0 ? " match the filters" : " yet"}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {view === "teams" && (
        <div className="surface-card overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
                <th className="px-3 py-2.5">Team</th>
                <th className="px-3 py-2.5">Matches</th>
                {counterIds.map((id) => (
                  <th key={id} className="px-3 py-2.5">
                    Avg {fieldLabels[id]}
                  </th>
                ))}
                <th className="px-3 py-2.5">Typical endgame</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {aggregates.map((agg) => (
                <tr key={agg.team} className="transition hover:bg-graphite-50">
                  <td className="stat px-3 py-2 font-semibold">{agg.team}</td>
                  <td className="stat px-3 py-2">{agg.matches}</td>
                  {counterIds.map((id) => (
                    <td key={id} className="stat px-3 py-2">
                      {(agg.averages[id] ?? 0).toFixed(1)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-graphite-600">
                    {agg.modes.endgame ?? "—"}
                  </td>
                </tr>
              ))}
              {aggregates.length === 0 && (
                <tr>
                  <td
                    colSpan={3 + counterIds.length}
                    className="px-3 py-8 text-center text-graphite-400"
                  >
                    No submissions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
