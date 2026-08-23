"use client";

import { DeepLinkParams } from "@/components/DeepLinkParams";
import { MyPitAssignments } from "@/components/MyAssignments";
import { PitAutos } from "@/components/PitAutos";
import { SchemaForm } from "@/components/SchemaForm";
import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  emptyValues,
  missingRequiredFields,
  type FormValues,
} from "@/lib/formSchema";
import { splitMediaValues } from "@/lib/formMedia";
import {
  isBlankAuto,
  parseAutoPaths,
  parseAutos,
  removedAutoIds,
  splitAutos,
  withPaths,
  type PitAutoWithPath,
} from "@/lib/pitAutos";
import { AUTO_SECTION_TITLE, PIT_MEDIA_COLLECTION } from "@/lib/pitScoutSchema";
import { submitLocally } from "@/lib/offlineSync";
import { SyncStatus } from "@/components/SyncStatus";
import { useScoutForms } from "@/lib/useScoutForms";
import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

/** Module-level so the deep-link reader's props stay referentially stable. */
const PIT_LINK_PARAMS = ["team"] as const;

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
  // A team arriving via /pit-scout?team=N, held until the auth team doc
  // resolves — openTeam() needs dataTeamId and a deep link routinely beats it.
  const [requestedTeam, setRequestedTeam] = useState<string | null>(null);
  // Which deep link has already been opened. A ref rather than clearing the
  // state above: reopening the form would discard whatever the scout has
  // typed since, and the guard has to survive re-renders without causing one.
  const openedLink = useRef<string | null>(null);
  const [values, setValues] = useState<FormValues>(() =>
    emptyValues(pitSections),
  );
  // Autos are their own list rather than a form value: a robot runs a variable
  // number of them, and each needs an identity the Strategy Board can point a
  // checkbox at. See src/lib/pitAutos.ts.
  const [autos, setAutos] = useState<PitAutoWithPath[]>([]);
  // The auto ids this robot was loaded with, so a save can positively delete
  // the path of one the scout removed (see removedAutoIds).
  const [loadedAutoIds, setLoadedAutoIds] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ state: "idle" });

  useEffect(() => {
    // If the customization arrives (or changes) mid-entry, add keys for any
    // new fields without losing what's already typed.
    setValues((prev) => ({ ...emptyValues(pitSections), ...prev }));
  }, [pitSections]);

  useEffect(() => {
    if (!requestedTeam || !dataTeamId) return;
    if (openedLink.current === requestedTeam) return;
    // Latched only once the robot is actually open. Burning the guard up
    // front meant a link that failed offline could never retry, even after
    // signal came back.
    void openTeam(requestedTeam).then((opened) => {
      if (opened) openedLink.current = requestedTeam;
    });
    // openTeam is recreated every render but is a one-shot handoff here;
    // listing it would refetch the form and discard in-progress answers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTeam, dataTeamId]);

  useEffect(() => {
    // Pit forms live in the shared store so a sister pair pools its data.
    if (!dataTeamId) return;
    return onSnapshot(
      collection(db, "teams", dataTeamId, "pitScouting"),
      (snapshot) => setScoutedTeams(snapshot.docs.map((d) => d.id).sort()),
    );
  }, [dataTeamId]);

  async function openTeam(teamNumber: string): Promise<boolean> {
    if (!dataTeamId) return false;
    const trimmed = teamNumber.trim();
    if (!trimmed) return false;

    setStatus({ state: "idle" });
    setTeamInput("");

    // Photos and drawings live in a sibling doc (see formMedia.ts) — fetch
    // both and reassemble one set of answers for the form.
    //
    // The media doc has no listener warming the cache, so offline its read
    // rejects outright; it's optional, so a failure there must not stop the
    // robot opening. The core doc IS cached, by the collection listener above.
    let snapshot;
    let mediaSnapshot = null;
    try {
      [snapshot, mediaSnapshot] = await Promise.all([
        getDoc(doc(db, "teams", dataTeamId, "pitScouting", trimmed)),
        getDoc(doc(db, "teams", dataTeamId, PIT_MEDIA_COLLECTION, trimmed)).catch(
          () => null,
        ),
      ]);
    } catch {
      // Leave activeTeam and values alone. Switching the header to a robot
      // whose answers never arrived would leave the PREVIOUS robot's answers
      // in the form, and saving merges them onto the new team's document.
      setStatus({
        state: "error",
        message: `Couldn't open ${trimmed} — you may be offline. Try again.`,
      });
      return false;
    }

    // Committed together, so the form never shows one robot's number over
    // another robot's answers.
    setActiveTeam(trimmed);
    setValues({
      ...emptyValues(pitSections),
      ...(snapshot.data()?.values as FormValues | undefined),
      ...(mediaSnapshot?.data()?.values as FormValues | undefined),
    });
    // Names and notes ride in the core doc, paths in the media doc — rejoined
    // here into the one list the editor works with.
    const loadedAutos = parseAutos(snapshot.data()?.autos);
    setAutos(
      withPaths(
        loadedAutos,
        parseAutoPaths(mediaSnapshot?.data()?.autoPaths),
      ),
    );
    setLoadedAutoIds(loadedAutos.map((auto) => auto.id));
    return true;
  }

  function handleSave() {
    if (!profile || !user || !activeTeam || !dataTeamId) return;

    const missing = missingRequiredFields(pitSections, values);
    if (missing.length > 0) {
      setStatus({ state: "error", message: `Missing: ${missing.join(", ")}` });
      return;
    }

    setStatus({ state: "saving" });
    const { core, media } = splitMediaValues(pitSections, values);
    // Rows the scout added and never filled in would show up on the Strategy
    // Board as nameless checkboxes, so they never reach the document.
    const { core: autoList, paths: autoPaths } = splitAutos(
      autos.filter((auto) => !isBlankAuto(auto)),
    );
    const autoPathWrite: Record<string, unknown> = { ...autoPaths };
    for (const id of removedAutoIds(loadedAutoIds, autoList)) {
      autoPathWrite[id] = deleteField();
    }
    try {
      // Handed to Firestore's queue rather than awaited: offline the write
      // lands in the IndexedDB cache immediately but the promise only settles
      // on the server's ack, which stranded this form on "Saving…" in a pit
      // with no signal. See submitLocally() in src/lib/offlineSync.ts.
      //
      // merge: two scouts editing the same robot offline both land their
      // fields on sync instead of the last save wiping the other's work.
      submitLocally(
        setDoc(
          doc(db, "teams", dataTeamId, "pitScouting", activeTeam),
          {
            scoutedTeam: activeTeam,
            values: core,
            // Written whole, not merged into: dropping an auto has to remove
            // it, and a merged array would keep the old entries alongside.
            autos: autoList,
            scoutName: profile.fullName,
            scoutUid: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        ),
      );
      if (Object.keys(media).length > 0 || Object.keys(autoPathWrite).length > 0) {
        submitLocally(
          setDoc(
            doc(db, "teams", dataTeamId, PIT_MEDIA_COLLECTION, activeTeam),
            {
              scoutedTeam: activeTeam,
              values: media,
              autoPaths: autoPathWrite,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          ),
        );
      }
      // Saving a robot's form is what "done" means for a pit assignment, so
      // cross it off here rather than making the scout tick it twice. Silent
      // on failure, and not a sync failure: no assignment set may exist at
      // all, and the form is saved either way.
      const teamNumber = Number(activeTeam);
      if (Number.isInteger(teamNumber)) {
        void updateDoc(
          doc(db, "teams", dataTeamId, "config", "pitAssignments"),
          { completedTeams: arrayUnion(teamNumber) },
        ).catch(() => undefined);
      }
      setLoadedAutoIds(autoList.map((auto) => auto.id));
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
        <h1 className="page-title">
          <span aria-hidden className="page-rule" />
          Pit Scout
        </h1>
        <p className="page-lede">
          One form per robot — filled out in the pit, editable any time.
        </p>
      </div>

      <DeepLinkParams
        names={PIT_LINK_PARAMS}
        onRead={(values) => setRequestedTeam(values.team ?? null)}
      />

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
            sectionSlots={{
              [AUTO_SECTION_TITLE]: (
                <PitAutos
                  autos={autos}
                  onChange={(next) => {
                    setAutos(next);
                    if (status.state !== "idle") setStatus({ state: "idle" });
                  }}
                />
              ),
            }}
          />

          <SyncStatus />

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
