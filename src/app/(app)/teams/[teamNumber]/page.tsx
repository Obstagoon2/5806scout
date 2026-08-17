"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  aggregateByTeam,
  counterFieldIds,
  selectFieldIds,
  type MatchSubmission,
} from "@/lib/aggregate";
import {
  buildTeamProfiles,
  sanitizeScoringWeights,
  SCORING_DOC_ID,
  type ScoringWeights,
} from "@/lib/drive";
import type { EventData } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import type { FieldDef, FormValues } from "@/lib/formSchema";
import { PIT_MEDIA_COLLECTION } from "@/lib/pitScoutSchema";
import { useScoutForms } from "@/lib/useScoutForms";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function TeamDetailPage() {
  const { teamNumber } = useParams<{ teamNumber: string }>();
  const { profile, dataTeamId } = useAuth();
  const { pitSections, matchSections } = useScoutForms();
  const isAdmin = profile?.role === "admin";

  const [event, setEvent] = useState<EventData | null>(null);
  const [submissions, setSubmissions] = useState<MatchSubmission[]>([]);
  const [weights, setWeights] = useState<ScoringWeights>({});
  const [pitValues, setPitValues] = useState<FormValues | null>(null);
  const [pitScoutName, setPitScoutName] = useState<string | null>(null);
  const [pitMedia, setPitMedia] = useState<FormValues | null>(null);

  useEffect(() => {
    if (!dataTeamId || !isAdmin) return;
    return onSnapshot(doc(db, "teams", dataTeamId, "config", "event"), (s) => {
      setEvent(s.exists() ? (s.data() as EventData) : null);
    });
  }, [dataTeamId, isAdmin]);

  // Whole-collection listener (same as the Data page) so the event-wide
  // baseline behind the strengths/weaknesses chips stays live too.
  useEffect(() => {
    if (!dataTeamId || !isAdmin) return;
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
  }, [dataTeamId, isAdmin]);

  useEffect(() => {
    if (!dataTeamId || !isAdmin) return;
    return onSnapshot(
      doc(db, "teams", dataTeamId, "config", SCORING_DOC_ID),
      (s) => setWeights(sanitizeScoringWeights(s.data())),
    );
  }, [dataTeamId, isAdmin]);

  useEffect(() => {
    if (!dataTeamId || !isAdmin || !teamNumber) return;
    const unsubPit = onSnapshot(
      doc(db, "teams", dataTeamId, "pitScouting", teamNumber),
      (s) => {
        setPitValues((s.data()?.values as FormValues | undefined) ?? null);
        setPitScoutName((s.data()?.scoutName as string | undefined) ?? null);
      },
    );
    const unsubMedia = onSnapshot(
      doc(db, "teams", dataTeamId, PIT_MEDIA_COLLECTION, teamNumber),
      (s) => setPitMedia((s.data()?.values as FormValues | undefined) ?? null),
    );
    return () => {
      unsubPit();
      unsubMedia();
    };
  }, [dataTeamId, isAdmin, teamNumber]);

  const teamSubmissions = useMemo(
    () => submissions.filter((s) => s.scoutedTeam === teamNumber),
    [submissions, teamNumber],
  );

  const strengthProfile = useMemo(() => {
    const parsed = Number(teamNumber);
    if (!Number.isInteger(parsed)) return undefined;
    return buildTeamProfiles(
      matchSections,
      aggregateByTeam(matchSections, submissions),
      weights,
      event?.teams ?? [],
    ).get(parsed);
  }, [matchSections, submissions, weights, event, teamNumber]);

  const aggregate = useMemo(
    () => aggregateByTeam(matchSections, teamSubmissions)[0] ?? null,
    [matchSections, teamSubmissions],
  );

  const counterIds = useMemo(
    () => counterFieldIds(matchSections),
    [matchSections],
  );
  const selectIds = useMemo(() => selectFieldIds(matchSections), [matchSections]);
  const fieldLabels = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        matchSections.flatMap((s) => s.fields.map((f) => [f.id, f.label])),
      ),
    [matchSections],
  );

  // Every free-text observation scouts wrote about this team, match by match.
  const comments = useMemo(() => {
    const textIds = matchSections.flatMap((s) =>
      s.fields
        .filter((f) => f.kind === "text" || f.kind === "textarea")
        .map((f) => f.id),
    );
    return teamSubmissions.flatMap((s) =>
      textIds.flatMap((id) => {
        const value = s.values[id];
        return typeof value === "string" && value.trim()
          ? [{ id: `${s.id}-${id}`, matchNumber: s.matchNumber, scoutName: s.scoutName, text: value.trim() }]
          : [];
      }),
    );
  }, [matchSections, teamSubmissions]);

  const eventTeam = useMemo(
    () =>
      event?.teams.find((t) => String(t.teamNumber) === teamNumber) ?? null,
    [event, teamNumber],
  );

  if (profile && !isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          Team breakdowns are only available to admins.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          <span className="stat">Team {teamNumber}</span>
          {eventTeam && (
            <span className="font-normal text-graphite-500">
              — {eventTeam.nickname}
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          {eventTeam?.city && `${eventTeam.city} · `}
          {teamSubmissions.length} match submission
          {teamSubmissions.length === 1 ? "" : "s"}
          {pitValues ? " · pit scouted" : " · not pit scouted yet"}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Predicted pts / match"
          value={
            strengthProfile?.points != null
              ? strengthProfile.points.toFixed(1)
              : "—"
          }
          hint={
            strengthProfile?.source === "scouted"
              ? `from ${strengthProfile.matches} scouted match${strengthProfile.matches === 1 ? "" : "es"}`
              : strengthProfile?.source === "epa"
                ? "Statbotics EPA (no scout data)"
                : "no data yet"
          }
        />
        <StatCard
          label="EPA"
          value={eventTeam?.epa != null ? eventTeam.epa.toFixed(1) : "—"}
          hint={
            eventTeam?.epaRank != null
              ? `#${eventTeam.epaRank} at this event`
              : "not ranked"
          }
        />
        <StatCard
          label="Edges vs field"
          value={
            strengthProfile
              ? `${strengthProfile.strengths.length}▲ ${strengthProfile.weaknesses.length}▼`
              : "—"
          }
          hint="counters ≥20% off the event average"
        />
      </div>

      {strengthProfile &&
        (strengthProfile.strengths.length > 0 ||
          strengthProfile.weaknesses.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {strengthProfile.strengths.map((edge) => (
              <span
                key={edge.fieldId}
                title={`${edge.avg.toFixed(1)}/match vs ${edge.eventAvg.toFixed(1)} event avg`}
                className="badge-success rounded px-2 py-1 text-xs normal-case tracking-normal"
              >
                ▲ {fieldLabels[edge.fieldId] ?? edge.fieldId}
              </span>
            ))}
            {strengthProfile.weaknesses.map((edge) => (
              <span
                key={edge.fieldId}
                title={`${edge.avg.toFixed(1)}/match vs ${edge.eventAvg.toFixed(1)} event avg`}
                className="badge-error rounded px-2 py-1 text-xs normal-case tracking-normal"
              >
                ▼ {fieldLabels[edge.fieldId] ?? edge.fieldId}
              </span>
            ))}
          </div>
        )}

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Match history</h2>
        {teamSubmissions.length === 0 ? (
          <div className="surface-panel px-6 py-8 text-center text-sm text-graphite-500">
            No match scouting submissions for this team yet.
          </div>
        ) : (
          <div className="surface-card overflow-x-auto">
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
                  <th className="px-3 py-2.5">Match</th>
                  <th className="px-3 py-2.5">Alliance</th>
                  {counterIds.map((id) => (
                    <th key={id} className="px-3 py-2.5">
                      {fieldLabels[id]}
                    </th>
                  ))}
                  {selectIds.map((id) => (
                    <th key={id} className="px-3 py-2.5">
                      {fieldLabels[id]}
                    </th>
                  ))}
                  <th className="px-3 py-2.5">Scout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-graphite-100">
                {teamSubmissions.map((s) => (
                  <tr key={s.id} className="transition hover:bg-graphite-50">
                    <td className="stat px-3 py-2">Q{s.matchNumber}</td>
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
                        {typeof s.values[id] === "number"
                          ? (s.values[id] as number)
                          : 0}
                      </td>
                    ))}
                    {selectIds.map((id) => (
                      <td key={id} className="px-3 py-2 text-graphite-600">
                        {typeof s.values[id] === "string" && s.values[id]
                          ? (s.values[id] as string)
                          : "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-graphite-500">{s.scoutName}</td>
                  </tr>
                ))}
                {aggregate && teamSubmissions.length > 1 && (
                  <tr className="border-t border-graphite-200 bg-graphite-50 font-semibold">
                    <td className="px-3 py-2 text-xs uppercase tracking-wider text-graphite-500">
                      Avg
                    </td>
                    <td className="px-3 py-2" />
                    {counterIds.map((id) => (
                      <td key={id} className="stat px-3 py-2">
                        {(aggregate.averages[id] ?? 0).toFixed(1)}
                      </td>
                    ))}
                    {selectIds.map((id) => (
                      <td key={id} className="px-3 py-2 text-graphite-600">
                        {aggregate.modes[id] ?? "—"}
                      </td>
                    ))}
                    <td className="px-3 py-2" />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {comments.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="section-title">Scout notes</h2>
          <ul className="surface-card divide-y divide-graphite-100">
            {comments.map((comment) => (
              <li key={comment.id} className="flex flex-col gap-0.5 px-4 py-2.5">
                <p className="text-sm text-graphite-700">{comment.text}</p>
                <p className="text-xs text-graphite-500">
                  <span className="stat">Q{comment.matchNumber}</span>
                  {comment.scoutName && ` — ${comment.scoutName}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="section-title">Pit scouting</h2>
        {!pitValues && !pitMedia ? (
          <div className="surface-panel px-6 py-8 text-center text-sm text-graphite-500">
            This robot hasn&apos;t been pit scouted yet.
          </div>
        ) : (
          <>
            {pitScoutName && (
              <p className="-mt-1 text-xs text-graphite-500">
                Scouted by {pitScoutName}.
              </p>
            )}
            {pitSections.map((section) => {
              const answered = section.fields.filter((field) =>
                hasAnswer(field, { ...pitValues, ...pitMedia }),
              );
              if (answered.length === 0) return null;
              return (
                <div key={section.title} className="surface-card p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-maroon-700 dark:text-maroon-300">
                    <span aria-hidden className="h-2.5 w-1 bg-maroon-600" />
                    {section.title}
                  </h3>
                  <dl className="flex flex-col gap-3">
                    {answered.map((field) => (
                      <div key={field.id} className="flex flex-col gap-1">
                        <dt className="text-xs font-medium uppercase tracking-wider text-graphite-500">
                          {field.label}
                        </dt>
                        <dd className="text-sm text-graphite-900">
                          <PitAnswer
                            field={field}
                            value={{ ...pitValues, ...pitMedia }[field.id] ?? null}
                          />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
          </>
        )}
      </section>

      <Link
        href="/data"
        className="btn-secondary self-start px-4 py-2"
      >
        ← Back to Data
      </Link>
    </main>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="surface-card flex flex-col gap-1 p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-graphite-500">
        {label}
      </p>
      <p className="stat text-2xl font-bold text-graphite-900">{value}</p>
      <p className="text-xs text-graphite-500">{hint}</p>
    </div>
  );
}

function hasAnswer(field: FieldDef, values: FormValues): boolean {
  const value = values[field.id];
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function PitAnswer({
  field,
  value,
}: {
  field: FieldDef;
  value: FormValues[string];
}) {
  if (field.kind === "drawing" || field.kind === "photo") {
    if (typeof value !== "string") return <>—</>;
    return (
      // Data-URL images from the media doc — next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt={field.label}
        className="max-h-80 w-auto max-w-full rounded-md border border-graphite-200"
      />
    );
  }
  if (Array.isArray(value)) return <>{value.join(", ")}</>;
  if (typeof value === "number") return <span className="stat">{value}</span>;
  return <>{String(value)}</>;
}
