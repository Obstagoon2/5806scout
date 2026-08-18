"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  aggregateByTeam,
  counterFieldIds,
  interquartileRange,
  median,
  type MatchSubmission,
} from "@/lib/aggregate";
import { useStoredPreference } from "@/lib/storedPreference";
import { ReliabilityWarning } from "@/components/ReliabilityFlags";
import { useScoutForms } from "@/lib/useScoutForms";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** Team number, linking through to that team's full breakdown. */
function TeamNumber({ team }: { team: string }) {
  return (
    <Link
      href={`/teams/${team}`}
      className="underline-offset-2 hover:text-maroon-700 hover:underline dark:hover:text-maroon-300"
    >
      {team}
    </Link>
  );
}

type View = "raw" | "teams";

/**
 * Which figure the By Team table reports. Mean is what every other screen
 * uses; median ignores the one match a robot spent tipped over; IQR mode
 * pairs that median with the width of the middle half of their matches, so a
 * dependable team and a coin flip with the same median stop looking alike.
 */
type StatMode = "mean" | "median" | "iqr";

const STAT_MODES: readonly StatMode[] = ["mean", "median", "iqr"];

const STAT_MODE_LABELS: Record<StatMode, string> = {
  mean: "Mean",
  median: "Median",
  iqr: "Median ±IQR",
};

const STAT_MODE_BLURBS: Record<StatMode, string> = {
  mean: "Average per match — the same figure the Picklist and Drive Dash use.",
  median:
    "Middle match, so one blown match or one lucky one doesn't move the number.",
  iqr: "Median, then the interquartile range (Q3 − Q1) after it: the width of the middle half of their matches. Small spread means you can count on them.",
};

/** One counter's value from every listed submission; a blank reads as 0,
 *  matching how aggregateByTeam counts an unanswered field. */
function columnValues(
  rows: readonly MatchSubmission[],
  id: string,
): number[] {
  return rows.map((s) => (typeof s.values[id] === "number" ? (s.values[id] as number) : 0));
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function statHeader(mode: StatMode, label: string): string {
  if (mode === "mean") return `Avg ${label}`;
  if (mode === "median") return `Median ${label}`;
  return `Median ±IQR ${label}`;
}

export default function DataPage() {
  const { dataTeamId } = useAuth();
  // Columns follow this team's customized schema, not the static defaults.
  const { matchSections } = useScoutForms();
  const [view, setView] = useState<View>("raw");
  const [statMode, setStatMode] = useStoredPreference<StatMode>(
    "data.statMode",
    STAT_MODES,
    "mean",
  );
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

  // One pass over the filtered rows per counter, reused by the summary row's
  // mean and its median/IQR rather than recomputed per cell.
  const filteredColumns = useMemo(
    () =>
      Object.fromEntries(
        counterIds.map((id) => [id, columnValues(filtered, id)] as const),
      ) as Record<string, number[]>,
    [counterIds, filtered],
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
        <div className="flex flex-wrap items-end gap-2">
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
          {/* Beside the view switcher, not above the table — it drives both
              views (the By Team columns and the Raw view's summary row) and
              has to be where the eye already is. */}
          <div className="surface-card flex p-0.5">
            {STAT_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setStatMode(m)}
                aria-pressed={statMode === m}
                className={`rounded px-3 py-1.5 text-sm font-medium transition ${
                  statMode === m
                    ? "bg-maroon-600 text-white"
                    : "text-graphite-600 hover:text-graphite-900"
                }`}
              >
                {STAT_MODE_LABELS[m]}
              </button>
            ))}
          </div>
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
                    <td className="stat px-3 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <TeamNumber team={s.scoutedTeam} />
                        <ReliabilityWarning
                          teamNumber={s.scoutedTeam}
                          matchNumber={s.matchNumber}
                        />
                      </span>
                    </td>
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
              {/* Summarises exactly the rows above, so narrowing the team or
                  scout filter is how you ask for one team's median. */}
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-graphite-300 bg-graphite-50 font-semibold">
                    <td className="px-3 py-2.5 text-xs uppercase tracking-wider text-graphite-500">
                      {STAT_MODE_LABELS[statMode]}
                    </td>
                    <td className="stat px-3 py-2.5 text-graphite-500">
                      {filtered.length} match{filtered.length === 1 ? "" : "es"}
                    </td>
                    <td className="px-3 py-2.5" />
                    {counterIds.map((id) => (
                      <td key={id} className="stat px-3 py-2.5">
                        <CounterStat
                          mode={statMode}
                          mean={mean(filteredColumns[id])}
                          samples={filteredColumns[id]}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2.5" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      <p className="-mt-3 text-xs text-graphite-500">
        {STAT_MODE_BLURBS[statMode]}
      </p>

      {view === "teams" && (
        <div className="surface-card overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
                <th className="px-3 py-2.5">Team</th>
                <th className="px-3 py-2.5">Matches</th>
                {counterIds.map((id) => (
                  <th key={id} className="px-3 py-2.5">
                    {statHeader(statMode, fieldLabels[id])}
                  </th>
                ))}
                <th className="px-3 py-2.5">Typical endgame</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {aggregates.map((agg) => (
                <tr key={agg.team} className="transition hover:bg-graphite-50">
                  <td className="stat px-3 py-2 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <TeamNumber team={agg.team} />
                      <ReliabilityWarning teamNumber={agg.team} />
                    </span>
                  </td>
                  <td className="stat px-3 py-2">{agg.matches}</td>
                  {counterIds.map((id) => (
                    <td key={id} className="stat px-3 py-2">
                      <CounterStat
                        mode={statMode}
                        mean={agg.averages[id] ?? 0}
                        samples={agg.samples[id] ?? []}
                      />
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

/** One counter's figure, in whichever form the By Team toggle asked for. */
function CounterStat({
  mode,
  mean,
  samples,
}: {
  mode: StatMode;
  mean: number;
  samples: readonly number[];
}) {
  if (mode === "mean") return <>{mean.toFixed(1)}</>;

  const middle = median(samples);
  if (middle === null) return <>—</>;
  if (mode === "median") return <>{middle.toFixed(1)}</>;

  const spread = interquartileRange(samples);
  return (
    <>
      {middle.toFixed(1)}
      {spread !== null && (
        <span
          className="ml-1 text-graphite-400"
          title="Interquartile range (Q3 − Q1) — the width of the middle half of their matches"
        >
          ±{spread.toFixed(1)}
        </span>
      )}
    </>
  );
}
