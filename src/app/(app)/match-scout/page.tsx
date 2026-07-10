"use client";

import { SchemaForm } from "@/components/SchemaForm";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import { emptyValues, type FormValues } from "@/lib/formSchema";
import { MATCH_SCOUT_SECTIONS } from "@/lib/matchScoutSchema";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
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
  const [matchNumber, setMatchNumber] = useState("");
  const [scoutedTeam, setScoutedTeam] = useState("");
  const [alliance, setAlliance] = useState<Alliance | null>(null);
  const [values, setValues] = useState<FormValues>(() =>
    emptyValues(MATCH_SCOUT_SECTIONS),
  );
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [recent, setRecent] = useState<RecentSubmission[]>([]);

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

    setStatus({ state: "saving" });
    try {
      await addDoc(collection(db, "teams", dataTeamId, "matchScouting"), {
        matchNumber: match,
        scoutedTeam: team,
        alliance,
        values,
        scoutName: profile.fullName,
        scoutUid: user.uid,
        createdAt: serverTimestamp(),
      });

      // Reset for the next match: bump match number, keep alliance (a scout
      // usually watches the same station), clear team + tallies.
      setMatchNumber(String(match + 1));
      setScoutedTeam("");
      setValues(emptyValues(MATCH_SCOUT_SECTIONS));
      setStatus({ state: "saved" });
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Submit failed",
      });
    }
  }

  const inputClass =
    "font-stat w-full rounded-md border border-graphite-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-graphite-900">Match Scout</h1>
        <p className="mt-1 text-sm text-graphite-500">
          One submission per robot per match — tally as you watch.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-graphite-200 bg-white p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-graphite-700">
              Match #<span className="ml-0.5 text-maroon-600">*</span>
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
              Team #<span className="ml-0.5 text-maroon-600">*</span>
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
            Alliance<span className="ml-0.5 text-maroon-600">*</span>
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={alliance === "red"}
              onClick={() => setAlliance("red")}
              className={`rounded-md border px-4 py-2.5 text-sm font-semibold transition ${
                alliance === "red"
                  ? "border-maroon-600 bg-maroon-600 text-white"
                  : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
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
                  : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
              }`}
            >
              Blue
            </button>
          </div>
        </div>

        <SchemaForm
          sections={MATCH_SCOUT_SECTIONS}
          values={values}
          onChange={(id, value) => {
            setValues((prev) => ({ ...prev, [id]: value }));
            if (status.state !== "idle" && status.state !== "saving") {
              setStatus({ state: "idle" });
            }
          }}
        />

        {status.state === "error" && (
          <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
            {status.message}
          </p>
        )}
        {status.state === "saved" && (
          <p className="rounded-md bg-green-100 px-3 py-2 text-sm text-green-500">
            Submitted — form reset for the next match.
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={status.state === "saving"}
          className="rounded-md bg-maroon-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
        >
          {status.state === "saving" ? "Submitting…" : "Submit match"}
        </button>
      </div>

      {recent.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
            Recent submissions
          </h2>
          <ul className="divide-y divide-graphite-100 rounded-lg border border-graphite-200 bg-white">
            {recent.map((submission) => (
              <li
                key={submission.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <span className="font-stat text-graphite-900">
                  Q{submission.matchNumber} · Team {submission.scoutedTeam}
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
