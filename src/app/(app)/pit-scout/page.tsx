"use client";

import { SchemaForm } from "@/components/SchemaForm";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  emptyValues,
  missingRequiredFields,
  type FormValues,
} from "@/lib/formSchema";
import { useScoutForms } from "@/lib/useScoutForms";
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
  // This team's customized schema (falls back to defaults until loaded).
  const { pitSections } = useScoutForms();
  const [scoutedTeams, setScoutedTeams] = useState<string[]>([]);
  const [teamInput, setTeamInput] = useState("");
  const [activeTeam, setActiveTeam] = useState<string | null>(null);
  const [values, setValues] = useState<FormValues>(() =>
    emptyValues(pitSections),
  );
  const [status, setStatus] = useState<Status>({ state: "idle" });

  useEffect(() => {
    // If the customization arrives (or changes) mid-entry, add keys for any
    // new fields without losing what's already typed.
    setValues((prev) => ({ ...emptyValues(pitSections), ...prev }));
  }, [pitSections]);

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
        ? { ...emptyValues(pitSections), ...existing.values }
        : emptyValues(pitSections),
    );
  }

  async function handleSave() {
    if (!profile || !user || !activeTeam || !dataTeamId) return;

    const missing = missingRequiredFields(pitSections, values);
    if (missing.length > 0) {
      setStatus({ state: "error", message: `Missing: ${missing.join(", ")}` });
      return;
    }

    setStatus({ state: "saving" });
    try {
      // merge: two scouts editing the same robot offline both land their
      // fields on sync instead of the last save wiping the other's work.
      await setDoc(
        doc(db, "teams", dataTeamId, "pitScouting", activeTeam),
        {
          scoutedTeam: activeTeam,
          values,
          scoutName: profile.fullName,
          scoutUid: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
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
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          Pit Scout
        </h1>
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
          className="field-input stat w-40"
        />
        <button
          type="submit"
          className="btn-primary"
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
              className={`stat rounded-full border px-3 py-1.5 text-sm transition ${
                team === activeTeam
                  ? "border-maroon-600 bg-maroon-600 text-white"
                  : "border-graphite-200 bg-surface text-graphite-700 hover:border-graphite-300"
              }`}
            >
              {team}
            </button>
          ))}
        </div>
      )}

      {activeTeam && (
        <div className="surface-card flex flex-col gap-6 p-4 md:p-6">
          <h2 className="stat text-lg font-semibold text-graphite-900">
            Team {activeTeam}
          </h2>

          <SchemaForm
            sections={pitSections}
            values={values}
            onChange={(id, value) => {
              setValues((prev) => ({ ...prev, [id]: value }));
              if (status.state !== "idle") setStatus({ state: "idle" });
            }}
          />

          {status.state === "error" && (
            <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
              {status.message}
            </p>
          )}
          {status.state === "saved" && (
            <p className="badge-success rounded-md px-3 py-2 text-sm normal-case tracking-normal">
              Saved.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={status.state === "saving"}
            className="btn-primary"
          >
            {status.state === "saving" ? "Saving…" : `Save Team ${activeTeam}`}
          </button>
        </div>
      )}
    </main>
  );
}
