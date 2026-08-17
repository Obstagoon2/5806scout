"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { aggregateByTeam, type MatchSubmission } from "@/lib/aggregate";
import {
  buildTeamProfiles,
  predictMatch,
  sanitizeScoringWeights,
  SCORING_DOC_ID,
  upcomingTeamMatches,
  type MatchPrediction,
  type ScoringWeights,
  type TeamStrengthProfile,
} from "@/lib/drive";
import type { EventData } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import { formatCountdown, matchLabel, msUntilMatch } from "@/lib/pitDashboard";
import { useScoutForms } from "@/lib/useScoutForms";
import { collection, doc, onSnapshot, orderBy, query } from "firebase/firestore";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function DrivePage() {
  const { profile, team, dataTeamId } = useAuth();
  const { matchSections } = useScoutForms();
  const isAdmin = profile?.role === "admin";

  const [event, setEvent] = useState<EventData | null>(null);
  const [eventLoaded, setEventLoaded] = useState(false);
  const [submissions, setSubmissions] = useState<MatchSubmission[]>([]);
  const [weights, setWeights] = useState<ScoringWeights>({});
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!dataTeamId || !isAdmin) return;
    return onSnapshot(doc(db, "teams", dataTeamId, "config", "event"), (s) => {
      setEvent(s.exists() ? (s.data() as EventData) : null);
      setEventLoaded(true);
    });
  }, [dataTeamId, isAdmin]);

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

  // Tick the countdown once a second while a scheduled match is coming up.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const myTeamNumber = Number(team?.teamNumber);

  const profiles = useMemo(
    () =>
      buildTeamProfiles(
        matchSections,
        aggregateByTeam(matchSections, submissions),
        weights,
        event?.teams ?? [],
      ),
    [matchSections, submissions, weights, event],
  );

  const predictions = useMemo<MatchPrediction[]>(() => {
    if (!event || !Number.isInteger(myTeamNumber)) return [];
    return upcomingTeamMatches(event.matches, myTeamNumber).map((m) =>
      predictMatch(m, profiles),
    );
  }, [event, myTeamNumber, profiles]);

  // Short labels for strength/weakness chips, from the live schema.
  const fieldLabels = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        matchSections.flatMap((s) => s.fields.map((f) => [f.id, f.label])),
      ),
    [matchSections],
  );

  if (profile && !isAdmin) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          The Drive dashboard is only available to admins.
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          Drive
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          Team {team?.teamNumber}&apos;s upcoming matches, predicted from your
          scouts&apos; data — EPA fills in for teams nobody has scouted yet.
        </p>
      </div>

      {eventLoaded && !event && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          Sync an event on the Event tab to see the schedule here.
        </div>
      )}

      {event && predictions.length === 0 && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          No upcoming matches for Team {team?.teamNumber} — you&apos;re done for
          the day (or the schedule hasn&apos;t been posted yet).
        </div>
      )}

      {predictions.map((prediction, index) => (
        <MatchCard
          key={prediction.match.key}
          prediction={prediction}
          isNext={index === 0}
          now={now}
          myTeamNumber={myTeamNumber}
          profiles={profiles}
          fieldLabels={fieldLabels}
        />
      ))}
    </main>
  );
}

function MatchCard({
  prediction,
  isNext,
  now,
  myTeamNumber,
  profiles,
  fieldLabels,
}: {
  prediction: MatchPrediction;
  isNext: boolean;
  now: number;
  myTeamNumber: number;
  profiles: ReadonlyMap<number, TeamStrengthProfile>;
  fieldLabels: Record<string, string>;
}) {
  const { match, red, blue, redWinProbability } = prediction;
  const untilMs = msUntilMatch(match, now);
  const weAreRed = match.red.includes(myTeamNumber);
  const ourProbability =
    redWinProbability === null
      ? null
      : weAreRed
        ? redWinProbability
        : 1 - redWinProbability;

  return (
    <section
      className={`surface-card flex flex-col gap-4 p-4 md:p-5 ${
        isNext ? "border-maroon-600" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-baseline gap-2 text-base font-semibold text-graphite-900">
          <span className="stat text-lg">{matchLabel(match)}</span>
          {isNext && (
            <span className="badge bg-maroon-600 text-white">Next up</span>
          )}
        </h2>
        <p className="stat text-sm text-graphite-500">
          {untilMs !== null
            ? untilMs > 0
              ? `in ${formatCountdown(untilMs)}`
              : "now"
            : "no scheduled time"}
        </p>
      </div>

      {ourProbability !== null && (
        <div className="flex items-center gap-3">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-graphite-100"
            role="img"
            aria-label={`Estimated win chance ${Math.round(ourProbability * 100)}%`}
          >
            <div
              className="h-full bg-maroon-600"
              style={{ width: `${Math.round(ourProbability * 100)}%` }}
            />
          </div>
          <p className="stat text-sm font-semibold text-graphite-900">
            {Math.round(ourProbability * 100)}%
          </p>
          <p className="text-xs text-graphite-500">our win chance</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(["red", "blue"] as const).map((color) => {
          const alliance = color === "red" ? red : blue;
          const teams = color === "red" ? match.red : match.blue;
          const ours = teams.includes(myTeamNumber);
          return (
            <div
              key={color}
              className={`flex flex-col gap-3 rounded-md border p-3 ${
                color === "red"
                  ? "border-maroon-200 dark:border-maroon-700"
                  : "border-sky-200 dark:border-sky-800"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={`text-xs font-semibold uppercase tracking-widest ${
                    color === "red"
                      ? "text-maroon-700 dark:text-maroon-300"
                      : "text-sky-700 dark:text-sky-300"
                  }`}
                >
                  {color} alliance{ours ? " — us" : ""}
                </p>
                <p className="stat text-sm font-semibold text-graphite-900">
                  {alliance.points !== null
                    ? `~${alliance.points.toFixed(0)} pts`
                    : "—"}
                </p>
              </div>
              {teams.map((teamNumber) => (
                <TeamRow
                  key={teamNumber}
                  teamNumber={teamNumber}
                  isUs={teamNumber === myTeamNumber}
                  profile={profiles.get(teamNumber)}
                  fieldLabels={fieldLabels}
                />
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TeamRow({
  teamNumber,
  isUs,
  profile,
  fieldLabels,
}: {
  teamNumber: number;
  isUs: boolean;
  profile: TeamStrengthProfile | undefined;
  fieldLabels: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-1 border-t border-graphite-100 pt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/teams/${teamNumber}`}
          className={`stat text-sm font-semibold underline-offset-2 hover:underline ${
            isUs ? "text-maroon-700 dark:text-maroon-300" : "text-graphite-900"
          }`}
        >
          {teamNumber}
        </Link>
        <p className="stat text-xs text-graphite-500">
          {profile?.points != null ? (
            <>
              {profile.points.toFixed(1)} pts
              <span className="ml-1.5 rounded bg-graphite-100 px-1 py-0.5 font-sans text-xs font-semibold uppercase text-graphite-500">
                {profile.source === "scouted"
                  ? `${profile.matches} scouted`
                  : "EPA"}
              </span>
            </>
          ) : (
            "no data"
          )}
        </p>
      </div>
      {profile && (profile.strengths.length > 0 || profile.weaknesses.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {profile.strengths.map((edge) => (
            <span
              key={edge.fieldId}
              title={`${edge.avg.toFixed(1)}/match vs ${edge.eventAvg.toFixed(1)} event avg`}
              className="badge-success rounded px-1.5 py-0.5 text-xs normal-case tracking-normal"
            >
              ▲ {fieldLabels[edge.fieldId] ?? edge.fieldId}
            </span>
          ))}
          {profile.weaknesses.map((edge) => (
            <span
              key={edge.fieldId}
              title={`${edge.avg.toFixed(1)}/match vs ${edge.eventAvg.toFixed(1)} event avg`}
              className="badge-error rounded px-1.5 py-0.5 text-xs normal-case tracking-normal"
            >
              ▼ {fieldLabels[edge.fieldId] ?? edge.fieldId}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
