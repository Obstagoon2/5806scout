// Wiping an event's collected scouting data back to empty, for the Team tab.
//
// Deliberately narrow. This clears what scouts *gathered* — pit and match
// submissions (and the robot pictures beside them), the assignment rotations,
// and the talkie board — and leaves the team itself alone: the roster, the
// sister link, the synced event, the custom forms, the picklist, and the pit
// map all survive. A reset means "start scouting over", not "start the team
// over".
//
// Runs client-side as the signed-in admin. A sister pair shares one canonical
// store, but linking only *copies* into it — each side keeps its pre-link
// docs where they were, and unlinking hands them back. So a reset clears every
// store the pair can reach, or a team could wipe the event, unlink, and watch
// the old season reappear.
//
// Deletes go store by store and collection by collection in batches (Firestore
// caps a WriteBatch at 500 operations), which means a failure part-way leaves
// whole collections untouched rather than one document half-gone.

import { db } from "@/lib/firebase/client";
import { PIT_MEDIA_COLLECTION } from "@/lib/pitScoutSchema";
import { RELIABILITY_FLAGS_DOC_ID } from "@/lib/reliability";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";

// Firestore caps a WriteBatch at 500 operations.
const BATCH_LIMIT = 450;

/** Subcollections emptied wholesale. */
const WIPED_COLLECTIONS = [
  "pitScouting",
  // Photos and drawings live beside the answers they belong to (see
  // formMedia.ts); leaving them would strand every robot's pictures.
  PIT_MEDIA_COLLECTION,
  "matchScouting",
  "talkie",
] as const;

/**
 * Config docs that are collected data rather than setup. The two assignment
 * rotations carry their own crossed-off lists, so deleting the doc clears
 * both; pitTodo is the Pit Dashboard's running "who's been visited" state,
 * which is meaningless once the pit answers behind it are gone; and the
 * reliability flags are nothing but a tally over match submissions, so
 * keeping them would warn about matches that no longer exist.
 */
const WIPED_CONFIG_DOCS: ReadonlySet<string> = new Set([
  "pitAssignments",
  "matchAssignments",
  "pitTodo",
  RELIABILITY_FLAGS_DOC_ID,
]);

/** How much each part of the reset actually removed. */
export interface ResetCounts {
  /** Robots with pit answers. */
  pitScouting: number;
  /** Robots with stored photos or drawings. */
  pitScoutingMedia: number;
  /** Match submissions. */
  matchScouting: number;
  /** Talkie requests. */
  talkie: number;
  /** Assignment rotations and reliability flags that existed to be cleared. */
  config: number;
}

/** Whether a reset would actually remove anything. */
export function isEmptyReset(counts: ResetCounts): boolean {
  return Object.values(counts).every((count) => count === 0);
}

/**
 * Delete every scouting submission, assignment, and talkie request across the
 * given stores, and report the totals. Duplicate ids are visited once, so an
 * unlinked team can pass its id alongside its own canonical store harmlessly.
 * Throws if a batch is rejected — the caller shows the failure rather than
 * reporting a reset that didn't happen.
 */
export async function resetScoutingData(
  teamIds: readonly string[],
): Promise<ResetCounts> {
  const counts: ResetCounts = {
    pitScouting: 0,
    pitScoutingMedia: 0,
    matchScouting: 0,
    talkie: 0,
    config: 0,
  };

  for (const teamId of new Set(teamIds)) {
    for (const name of WIPED_COLLECTIONS) {
      const snapshot = await getDocs(collection(db, "teams", teamId, name));
      counts[name] += await deleteDocs(
        teamId,
        name,
        snapshot.docs.map((d) => d.id),
      );
    }

    // Config is read first and filtered: it also holds the team's setup, so
    // only the named docs go, and only the ones that are actually there.
    const config = await getDocs(collection(db, "teams", teamId, "config"));
    counts.config += await deleteDocs(
      teamId,
      "config",
      config.docs.map((d) => d.id).filter((id) => WIPED_CONFIG_DOCS.has(id)),
    );
  }

  return counts;
}

async function deleteDocs(
  teamId: string,
  name: string,
  ids: readonly string[],
): Promise<number> {
  for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const id of ids.slice(i, i + BATCH_LIMIT)) {
      batch.delete(doc(db, "teams", teamId, name, id));
    }
    await batch.commit();
  }
  return ids.length;
}
