"use client";

import { MyPitAssignments } from "@/components/MyAssignments";
import { SchemaForm } from "@/components/SchemaForm";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  emptyValues,
  missingRequiredFields,
  type FormValues,
} from "@/lib/formSchema";
import { splitMediaValues } from "@/lib/formMedia";
import { PIT_MEDIA_COLLECTION } from "@/lib/pitScoutSchema";
import { useScoutForms } from "@/lib/useScoutForms";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
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

    // Photos and drawings live in a sibling doc (see formMedia.ts) — fetch
    // both and reassemble one set of answers for the form.
    const [snapshot, mediaSnapshot] = await Promise.all([
      getDoc(doc(db, "teams", dataTeamId, "pitScouting", trimmed)),
      getDoc(doc(db, "teams", dataTeamId, PIT_MEDIA_COLLECTION, trimmed)),
    ]);
    setValues({
      ...emptyValues(pitSections),
      ...(snapshot.data()?.values as FormValues | undefined),
      ...(mediaSnapshot.data()?.values as FormValues | undefined),
    });
  }

  async function handleSave() {
    if (!profile || !user || !activeTeam || !dataTeamId) return;

    const missing = missingRequiredFields(pitSections, values);
    if (missing.length > 0) {
      setStatus({ state: "error", message: `Missing: ${missing.join(", ")}` });
      return;
    }

    setStatus({ state: "saving" });
    const { core, media } = splitMediaValues(pitSections, values);
    try {
      // merge: two scouts editing the same robot offline both land their
      // fields on sync instead of the last save wiping the other's work.
      await setDoc(
        doc(db, "teams", dataTeamId, "pitScouting", activeTeam),
        {
          scoutedTeam: activeTeam,
          values: core,
          scoutName: profile.fullName,
          scoutUid: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      if (Object.keys(media).length > 0) {
        await setDoc(
          doc(db, "teams", dataTeamId, PIT_MEDIA_COLLECTION, activeTeam),
          {
            scoutedTeam: activeTeam,
            values: media,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
      // Saving a robot's form is what "done" means for a pit assignment, so
      // cross it off here rather than making the scout tick it twice.
      const teamNumber = Number(activeTeam);
      if (Number.isInteger(teamNumber)) {
        try {
          await updateDoc(
            doc(db, "teams", dataTeamId, "config", "pitAssignments"),
            { completedTeams: arrayUnion(teamNumber) },
          );
        } catch {
          // No assignment set has been generated — the form is saved either
          // way, which is what the scout cares about.
        }
      }
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

      <MyPitAssignments
        activeTeam={activeTeam}
        onOpenTeam={(teamNumber) => void openTeam(teamNumber)}
      />

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
