"use client";

import { ReliabilityWarning } from "@/components/ReliabilityFlags";
import { SchemaForm } from "@/components/SchemaForm";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  emptyValues,
  missingRequiredFields,
  type FormValues,
} from "@/lib/formSchema";
import { RELIABILITY_FLAGS_DOC_ID } from "@/lib/reliability";
import { useScoutForms } from "@/lib/useScoutForms";
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";

type Alliance = "red" | "blue";

interface RecentSubmission {
  id: string;
  matchNumber: number;
  scoutedTeam: string;
  alliance: Alliance;
  scoutName: string;
}

type Status =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; message: string };

export default function MatchScoutPage() {
  const { profile, user, dataTeamId } = useAuth();
  // This team's customized schema (falls back to defaults until loaded).
  const { matchSections } = useScoutForms();
  const [matchNumber, setMatchNumber] = useState("");
  const [scoutedTeam, setScoutedTeam] = useState("");
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [values, setValues] = useState<FormValues>(() =>
    emptyValues(matchSections),
  );
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [reliabilityIssue, setReliabilityIssue] = useState(false);
  const [recent, setRecent] = useState<RecentSubmission[]>([]);

  useEffect(() => {
    // If the customization arrives (or changes) mid-entry, add keys for any
    // new fields without losing tallies already counted.
    setValues((prev) => ({ ...emptyValues(matchSections), ...prev }));
  }, [matchSections]);

  useEffect(() => {
    // Submissions land in the shared store so a sister pair pools its data.
    if (!dataTeamId) return;
    return onSnapshot(
      query(
        collection(db, "teams", dataTeamId, "matchScouting"),
        orderBy("createdAt", "desc"),
        limit(10),
      ),
      (snapshot) =>
        setRecent(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              matchNumber: data.matchNumber as number,
              scoutedTeam: data.scoutedTeam as string,
              alliance: data.alliance as Alliance,
              scoutName: data.scoutName as string,
            };
          }),
        ),
    );
  }, [dataTeamId]);

  async function handleSubmit() {
    if (!profile || !user || !dataTeamId) return;

    const match = Number(matchNumber.trim());
    const team = scoutedTeam.trim();
    if (!match || !team || !alliance) {
      setStatus({
        state: "error",
        message: "Match number, team number, and alliance are required.",
      });
      return;
    }

    // The default match form has no required fields, but Form Setup lets an
    // admin add required custom questions — enforce them like pit scout does.
    const missing = missingRequiredFields(matchSections, values);
    if (missing.length > 0) {
      setStatus({ state: "error", message: `Missing: ${missing.join(", ")}` });
      return;
    }

    setStatus({ state: "saving" });
    try {
      await addDoc(collection(db, "teams", dataTeamId, "matchScouting"), {
        matchNumber: match,
        scoutedTeam: team,
        alliance,
        values,
        reliabilityIssue,
        scoutName: profile.fullName,
        scoutUid: user.uid,
        createdAt: serverTimestamp(),
      });

      // Every submission bumps the team's scouted-match counter — that's the
      // denominator that decides whether a flag stays scoped to this match or
      // escalates to a team-wide warning. A checked flag also records the match
      // it came from. arrayUnion keeps concurrent scouts from clobbering each
      // other and collapses duplicate submissions for the same match; merge
      // keeps other teams' counters intact.
      await setDoc(
        doc(db, "teams", dataTeamId, "config", RELIABILITY_FLAGS_DOC_ID),
        {
          teams: {
            [team]: {
              scoutedMatches: arrayUnion(match),
              ...(reliabilityIssue
                ? {
                    flaggedMatches: arrayUnion(match),
                    flaggedByName: profile.fullName,
                    updatedAtMs: Date.now(),
                  }
                : {}),
            },
          },
        },
        { merge: true },
      );

      // Reset for the next match: bump match number, keep alliance (a scout
      // usually watches the same station), clear team + tallies + the flag.
      setMatchNumber(String(match + 1));
      setScoutedTeam("");
      setValues(emptyValues(matchSections));
      setReliabilityIssue(false);
      setStatus({ state: "saved" });
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Submit failed",
      });
    }
  }

  const inputClass = "field-input stat";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          Match Scout
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          One submission per robot per match — tally as you watch.
        </p>
      </div>

      <div className="surface-card flex flex-col gap-4 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-graphite-700">
              Match #<span className="ml-0.5 text-maroon-600 dark:text-maroon-400">*</span>
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={matchNumber}
              onChange={(e) => setMatchNumber(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-graphite-700">
              Team #<span className="ml-0.5 text-maroon-600 dark:text-maroon-400">*</span>
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={scoutedTeam}
              onChange={(e) => setScoutedTeam(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div
          role="group"
          aria-label="Alliance"
          className="flex flex-col gap-1.5"
        >
          <span className="text-sm font-medium text-graphite-700">
            Alliance<span className="ml-0.5 text-maroon-600 dark:text-maroon-400">*</span>
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={alliance === "red"}
              onClick={() => setAlliance("red")}
              className={`rounded-md border px-4 py-2.5 text-sm font-semibold transition ${
                alliance === "red"
                  ? "border-maroon-600 bg-maroon-600 text-white"
                  : "border-graphite-200 bg-surface text-graphite-700 hover:border-graphite-300"
              }`}
            >
              Red
            </button>
            <button
              type="button"
              aria-pressed={alliance === "blue"}
              onClick={() => setAlliance("blue")}
              className={`rounded-md border px-4 py-2.5 text-sm font-semibold transition ${
                alliance === "blue"
                  ? "border-sky-700 bg-sky-700 text-white"
                  : "border-graphite-200 bg-surface text-graphite-700 hover:border-graphite-300"
              }`}
            >
              Blue
            </button>
          </div>
        </div>

        <SchemaForm
          sections={matchSections}
          values={values}
          onChange={(id, value) => {
            setValues((prev) => ({ ...prev, [id]: value }));
            if (status.state !== "idle" && status.state !== "saving") {
              setStatus({ state: "idle" });
            }
          }}
        />

        <label
          className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2.5 transition ${
            reliabilityIssue
              ? "border-red-500 bg-red-50 dark:bg-red-950/30"
              : "border-graphite-200 hover:border-red-300"
          }`}
        >
          <input
            type="checkbox"
            checked={reliabilityIssue}
            onChange={(e) => {
              setReliabilityIssue(e.target.checked);
              if (status.state !== "idle" && status.state !== "saving") {
                setStatus({ state: "idle" });
              }
            }}
            className="h-4 w-4 shrink-0 accent-red-600"
          />
          <span className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
            Reliability Issue
          </span>
        </label>

        {status.state === "error" && (
          <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
            {status.message}
          </p>
        )}
        {status.state === "saved" && (
          <p className="badge-success rounded-md px-3 py-2 text-sm normal-case tracking-normal">
            Submitted — form reset for the next match.
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={status.state === "saving"}
          className="btn-primary"
        >
          {status.state === "saving" ? "Submitting…" : "Submit match"}
        </button>
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="section-title">Recent submissions</h2>
          <ul className="surface-card divide-y divide-graphite-100">
            {recent.map((submission) => (
              <li
                key={submission.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="stat flex items-center gap-1.5 text-graphite-900">
                  Q{submission.matchNumber} · Team {submission.scoutedTeam}
                  <ReliabilityWarning
                    teamNumber={submission.scoutedTeam}
                    matchNumber={submission.matchNumber}
                  />
                </span>
                <span className="flex items-center gap-2 text-graphite-500">
                  <span
                    aria-hidden
                    className={`h-2 w-2 rounded-full ${
                      submission.alliance === "red" ? "bg-maroon-500" : "bg-sky-600"
                    }`}
                  />
                  {submission.scoutName}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
