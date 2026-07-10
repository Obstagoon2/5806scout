"use client";

import { SchemaForm } from "@/components/SchemaForm";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  emptyValues,
  missingRequiredFields,
  type FormValues,
} from "@/lib/formSchema";
import { PIT_SCOUT_SECTIONS } from "@/lib/pitScoutSchema";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";

type Status =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; message: string };

export default function PitScoutPage() {
  const { profile, user, dataTeamId } = useAuth();
  const [scoutedTeams, setScoutedTeams] = useState<string[]>([]);
  const [teamInput, setTeamInput] = useState("");
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>(() =>
    emptyValues(PIT_SCOUT_SECTIONS),
  );
  const [status, setStatus] = useState<Status>({ state: "idle" });

  useEffect(() => {
    // Pit forms live in the shared store so a sister pair pools its data.
    if (!dataTeamId) return;
    return onSnapshot(
      collection(db, "teams", dataTeamId, "pitScouting"),
      (snapshot) => setScoutedTeams(snapshot.docs.map((d) => d.id).sort()),
    );
  }, [dataTeamId]);

  async function openTeam(teamNumber: string) {
    if (!dataTeamId) return;
    const trimmed = teamNumber.trim();
    if (!trimmed) return;

    setStatus({ state: "idle" });
    setActiveTeam(trimmed);
    setTeamInput("");

    const snapshot = await getDoc(
      doc(db, "teams", dataTeamId, "pitScouting", trimmed),
    );
    const existing = snapshot.data();
    setValues(
      existing?.values
        ? { ...emptyValues(PIT_SCOUT_SECTIONS), ...existing.values }
        : emptyValues(PIT_SCOUT_SECTIONS),
    );
  }

  async function handleSave() {
    if (!profile || !user || !activeTeam || !dataTeamId) return;

    const missing = missingRequiredFields(PIT_SCOUT_SECTIONS, values);
    if (missing.length > 0) {
      setStatus({ state: "error", message: `Missing: ${missing.join(", ")}` });
      return;
    }

    setStatus({ state: "saving" });
    try {
      await setDoc(doc(db, "teams", dataTeamId, "pitScouting", activeTeam), {
        scoutedTeam: activeTeam,
        values,
        scoutName: profile.fullName,
        scoutUid: user.uid,
        updatedAt: serverTimestamp(),
      });
      setStatus({ state: "saved" });
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-graphite-900">Pit Scout</h1>
        <p className="mt-1 text-sm text-graphite-500">
          One form per robot — filled out in the pit, editable any time.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          openTeam(teamInput);
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          placeholder="Team number"
          value={teamInput}
          onChange={(e) => setTeamInput(e.target.value)}
          className="font-stat w-40 rounded-md border border-graphite-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100"
        />
        <button
          type="submit"
          className="rounded-md bg-maroon-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-maroon-700"
        >
          Scout
        </button>
      </form>

      {scoutedTeams.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {scoutedTeams.map((team) => (
            <button
              key={team}
              type="button"
              onClick={() => openTeam(team)}
              className={`font-stat rounded-full border px-3 py-1.5 text-sm transition ${
                team === activeTeam
                  ? "border-maroon-600 bg-maroon-50 text-maroon-700"
                  : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
              }`}
            >
              {team}
            </button>
          ))}
        </div>
      )}

      {activeTeam && (
        <div className="flex flex-col gap-6 rounded-lg border border-graphite-200 bg-white p-4 md:p-6">
          <h2 className="font-stat text-lg font-semibold text-graphite-900">
            Team {activeTeam}
          </h2>

          <SchemaForm
            sections={PIT_SCOUT_SECTIONS}
            values={values}
            onChange={(id, value) => {
              setValues((prev) => ({ ...prev, [id]: value }));
              if (status.state !== "idle") setStatus({ state: "idle" });
            }}
          />

          {status.state === "error" && (
            <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
              {status.message}
            </p>
          )}
          {status.state === "saved" && (
            <p className="rounded-md bg-green-100 px-3 py-2 text-sm text-green-500">
              Saved.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={status.state === "saving"}
            className="rounded-md bg-maroon-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
          >
            {status.state === "saving" ? "Saving…" : `Save Team ${activeTeam}`}
          </button>
        </div>
      )}
    </main>
  );
}
