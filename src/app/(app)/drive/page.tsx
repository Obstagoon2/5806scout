"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { aggregateByTeam, type MatchSubmission } from "@/lib/aggregate";
import {
  buildTeamProfiles,
  missingPredictionFields,
  pastTeamMatches,
  predictMatch,
  reviewMatch,
  SCORING_WEIGHTS,
  upcomingTeamMatches,
  type MatchPrediction,
  type MatchReview,
  type TeamStrengthProfile,
} from "@/lib/drive";
import type { EventData } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import { MATCH_FIELD_LABELS } from "@/lib/matchScoutSchema";
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

  // Tick the countdown once a second while a scheduled match is coming up.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const myTeamNumber = Number(team?.teamNumber);
  // Which team the dashboard is following. Null means "whoever's signed in" —
  // kept null rather than seeded so the default survives the team doc loading
  // after first paint.
  const [focusTeam, setFocusTeam] = useState<number | null>(null);
  const viewedTeamNumber = focusTeam ?? myTeamNumber;
  const isOwnTeam = viewedTeamNumber === myTeamNumber;

  // Every team at the event, plus ours if the sync hasn't listed it — the
  // picker should never be missing the team that's using the app.
  const teamChoices = useMemo(() => {
    const numbers = new Set((event?.teams ?? []).map((t) => t.teamNumber));
    if (Number.isInteger(myTeamNumber)) numbers.add(myTeamNumber);
    return [...numbers].sort((a, b) => a - b);
  }, [event, myTeamNumber]);

  const profiles = useMemo(
    () =>
      buildTeamProfiles(
        matchSections,
        aggregateByTeam(matchSections, submissions),
        SCORING_WEIGHTS,
        event?.teams ?? [],
      ),
    [matchSections, submissions, event],
  );

  const predictions = useMemo<MatchPrediction[]>(() => {
    if (!event || !Number.isInteger(viewedTeamNumber)) return [];
    return upcomingTeamMatches(event.matches, viewedTeamNumber).map((m) =>
      predictMatch(m, profiles),
    );
  }, [event, viewedTeamNumber, profiles]);

  const reviews = useMemo<MatchReview[]>(() => {
    if (!event || !Number.isInteger(viewedTeamNumber)) return [];
    return pastTeamMatches(event.matches, viewedTeamNumber).map((m) =>
      reviewMatch(m, profiles),
    );
  }, [event, viewedTeamNumber, profiles]);

  // Short labels for strength/weakness chips, from the live schema.
  const fieldLabels = useMemo<Record<string, string>>(
    () =>
      Object.fromEntries(
        matchSections.flatMap((s) => s.fields.map((f) => [f.id, f.label])),
      ),
    [matchSections],
  );

  // Predictor inputs this team's Match Scout form no longer collects — the
  // points they used to carry are silently missing from every number below.
  const missingInputs = useMemo(
    () => missingPredictionFields(matchSections),
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
          Drive Dash
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          Team {viewedTeamNumber || "—"}&apos;s upcoming matches, predicted from
          your scouts&apos; data — EPA fills in for teams nobody has scouted
          yet.
        </p>
      </div>

      {missingInputs.length > 0 && (
        <p className="badge-error flex items-start gap-2 rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          <span aria-hidden>⚠</span>
          <span>
            Predictions are degraded —{" "}
            {missingInputs
              .map((fieldId) => MATCH_FIELD_LABELS[fieldId] ?? fieldId)
              .join(", ")}{" "}
            {missingInputs.length === 1 ? "is" : "are"} no longer scouted, so{" "}
            {missingInputs.length === 1 ? "its" : "their"} points are missing
            from every number below.{" "}
            <Link href="/form-settings" className="underline underline-offset-2">
              Restore it in Settings → Match Scout
            </Link>
            .
          </span>
        </p>
      )}

      {teamChoices.length > 1 && (
        // Not a <label> around the whole row: that would steal the accessible
        // name of the reset button sitting next to the select.
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-graphite-700">
              Following
            </span>
            <select
              value={Number.isInteger(viewedTeamNumber) ? viewedTeamNumber : ""}
              onChange={(e) => setFocusTeam(Number(e.target.value))}
              className="field-input stat w-auto"
            >
              {teamChoices.map((teamNumber) => (
                <option key={teamNumber} value={teamNumber}>
                  {teamNumber}
                  {teamNumber === myTeamNumber ? " (us)" : ""}
                </option>
              ))}
            </select>
          </label>
          {!isOwnTeam && (
            <button
              type="button"
              onClick={() => setFocusTeam(null)}
              className="btn-secondary"
            >
              Back to Team {myTeamNumber}
            </button>
          )}
        </div>
      )}

      {eventLoaded && !event && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          Sync an event on the Event tab to see the schedule here.
        </div>
      )}

      {event && predictions.length === 0 && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          No upcoming matches for Team {viewedTeamNumber} —{" "}
          {isOwnTeam ? "you're" : "they're"} done for the day (or the schedule
          hasn&apos;t been posted yet).
        </div>
      )}

      {predictions.map((prediction, index) => (
        <MatchCard
          key={prediction.match.key}
          prediction={prediction}
          isNext={index === 0}
          now={now}
          focusTeamNumber={viewedTeamNumber}
          isOwnTeam={isOwnTeam}
          profiles={profiles}
          fieldLabels={fieldLabels}
        />
      ))}

      {reviews.length > 0 && (
        <section className="flex flex-col gap-3">
          <div>
            <h2 className="section-title">Played matches</h2>
            <p className="mt-1 text-xs text-graphite-500">
              What the predictor says about each finished match, next to the
              real result. These run on today&apos;s scouting data — including
              the match itself — so treat a hit as a sanity check, not a
              backtest.
            </p>
          </div>
          {reviews.map((review) => (
            <PastMatchRow
              key={review.prediction.match.key}
              review={review}
              focusTeamNumber={viewedTeamNumber}
            />
          ))}
        </section>
      )}
    </main>
  );
}

/** One finished match: predicted win chance vs. what actually happened. */
function PastMatchRow({
  review,
  focusTeamNumber,
}: {
  review: MatchReview;
  focusTeamNumber: number;
}) {
  const { prediction, winner, called } = review;
  const { match, red, blue, redWinProbability } = prediction;
  const theyAreRed = match.red.includes(focusTeamNumber);
  const ourProbability =
    redWinProbability === null
      ? null
      : theyAreRed
        ? redWinProbability
        : 1 - redWinProbability;
  const theyWon = winner === (theyAreRed ? "red" : "blue");

  return (
    <div className="surface-card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex items-baseline gap-2.5">
        <span className="stat text-sm font-semibold text-graphite-900">
          {matchLabel(match)}
        </span>
        {winner !== null && (
          <span
            className={
              winner === "tie"
                ? "badge bg-graphite-100 text-graphite-500"
                : theyWon
                  ? "badge-success badge"
                  : "badge-error badge"
            }
          >
            {winner === "tie" ? "Tie" : theyWon ? "Won" : "Lost"}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-4">
        <p className="stat text-sm text-graphite-500">
          <span className="text-maroon-700 dark:text-maroon-300">
            {match.redScore ?? "—"}
          </span>
          {" – "}
          <span className="text-sky-700 dark:text-sky-300">
            {match.blueScore ?? "—"}
          </span>
          <span className="ml-1.5 font-sans text-xs uppercase tracking-widest">
            actual
          </span>
        </p>
        <p className="stat text-sm text-graphite-500">
          <span className="text-maroon-700 dark:text-maroon-300">
            {red.points !== null ? red.points.toFixed(0) : "—"}
          </span>
          {" – "}
          <span className="text-sky-700 dark:text-sky-300">
            {blue.points !== null ? blue.points.toFixed(0) : "—"}
          </span>
          <span className="ml-1.5 font-sans text-xs uppercase tracking-widest">
            predicted
          </span>
        </p>
        {ourProbability !== null && (
          <p
            className="stat text-sm font-semibold text-graphite-900"
            title={`Predicted ${Math.round(ourProbability * 100)}% win chance for Team ${focusTeamNumber}`}
          >
            {Math.round(ourProbability * 100)}%
            {called !== null && (
              <span
                aria-label={called ? "Predictor called it" : "Predictor missed"}
                className={`ml-1.5 ${
                  called
                    ? "text-green-700 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {called ? "✓" : "✗"}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

function MatchCard({
  prediction,
  isNext,
  now,
  focusTeamNumber,
  isOwnTeam,
  profiles,
  fieldLabels,
}: {
  prediction: MatchPrediction;
  isNext: boolean;
  now: number;
  /** The team this card is written from the point of view of. */
  focusTeamNumber: number;
  /** Whether that team is the one signed in — decides "us" vs. their number. */
  isOwnTeam: boolean;
  profiles: ReadonlyMap<number, TeamStrengthProfile>;
  fieldLabels: Record<string, string>;
}) {
  const { match, red, blue, redWinProbability } = prediction;
  const untilMs = msUntilMatch(match, now);
  const theyAreRed = match.red.includes(focusTeamNumber);
  const ourProbability =
    redWinProbability === null
      ? null
      : theyAreRed
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
          <p className="text-xs text-graphite-500">
            {isOwnTeam ? "our" : `${focusTeamNumber}'s`} win chance
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {(["red", "blue"] as const).map((color) => {
          const alliance = color === "red" ? red : blue;
          const teams = color === "red" ? match.red : match.blue;
          const ours = teams.includes(focusTeamNumber);
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
                  {color} alliance
                  {ours ? (isOwnTeam ? " — us" : ` — ${focusTeamNumber}`) : ""}
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
                  isUs={teamNumber === focusTeamNumber}
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
