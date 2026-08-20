// A robot's autonomous routines, as recorded in the pit.
//
// Why these don't live in the pit form's schema (src/lib/pitScoutSchema.ts):
// that schema is a flat map of one answer per field, and a robot runs a
// variable number of autos. More to the point, the Strategy Board has to pull
// a specific team's specific auto onto a shared field, which needs each
// routine to have its own identity and its own replayable path — neither of
// which a single "auto routines" textarea can give it.
//
// Storage mirrors the split the rest of the pit form already makes (see
// src/lib/formMedia.ts):
//
//   pitScouting/{team}.autos            — [{ id, name }], light enough
//                                          that the collection listener on the
//                                          Pit Scout page still costs nothing.
//   pitScoutingMedia/{team}.autoPaths   — { [autoId]: "<serialized strokes>" },
//                                          the heavy half, fetched per robot.

import {
  parseStrokes,
  serializeStrokes,
  type SketchStroke,
} from "@/lib/fieldSketch";

/** How many routines one robot may have. A team that claims more than this in
 *  the pit is describing variations, not separate autos. */
export const MAX_AUTOS_PER_ROBOT = 8;

export interface PitAuto {
  /** Stable across renames — the Strategy Board's checkboxes point at it. */
  id: string;
  /** What the team calls it: "3-piece left", "far side taxi". */
  name: string;
}

/** One auto with its path attached, which is how the UI works with them. */
export interface PitAutoWithPath extends PitAuto {
  strokes: SketchStroke[];
}

/** Serialized paths as they sit in the media doc, keyed by auto id. */
export type AutoPathMap = Record<string, string>;

/**
 * A fresh id. Random rather than an index so renaming or deleting the second
 * of four autos can't silently repoint a Strategy Board selection at a
 * different routine.
 */
export function newAutoId(): string {
  return crypto.randomUUID();
}

/** The name to show when a scout hasn't typed one yet. */
export function autoDisplayName(auto: PitAuto, index: number): string {
  const trimmed = auto.name.trim();
  return trimmed === "" ? `Auto ${index + 1}` : trimmed;
}

/**
 * Read the `autos` array off a pit submission. Tolerant by design — it parses
 * documents written by older builds and by other clients, and a malformed
 * entry should cost that one routine, not the whole robot.
 */
export function parseAutos(raw: unknown): PitAuto[] {
  if (!Array.isArray(raw)) return [];
  const autos: PitAuto[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const id = record.id;
    if (typeof id !== "string" || id === "") continue;
    autos.push({
      id,
      name: typeof record.name === "string" ? record.name : "",
    });
    if (autos.length >= MAX_AUTOS_PER_ROBOT) break;
  }
  return autos;
}

/** Read the `autoPaths` map off a pit media document. */
export function parseAutoPaths(raw: unknown): AutoPathMap {
  if (typeof raw !== "object" || raw === null) return {};
  const paths: AutoPathMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") paths[id] = value;
  }
  return paths;
}

/** Join the two halves back into what the editor and the board work with. */
export function withPaths(
  autos: readonly PitAuto[],
  paths: AutoPathMap,
): PitAutoWithPath[] {
  return autos.map((auto) => ({
    ...auto,
    strokes: parseStrokes(paths[auto.id]),
  }));
}

/** Split the editor's working list back into the two documents it saves to. */
export function splitAutos(autos: readonly PitAutoWithPath[]): {
  core: PitAuto[];
  paths: AutoPathMap;
} {
  const core: PitAuto[] = [];
  const paths: AutoPathMap = {};
  for (const auto of autos) {
    core.push({ id: auto.id, name: auto.name });
    // Every auto gets a key, empty included: a path the scout erased has to
    // overwrite the saved one, and an absent key merges the old one back.
    paths[auto.id] = serializeStrokes(auto.strokes);
  }
  return { core, paths };
}

/**
 * Whether a routine is worth saving at all. An auto with no name and no path
 * is a row the scout added and never filled in; keeping it would put an empty
 * checkbox on the Strategy Board.
 */
export function isBlankAuto(auto: PitAutoWithPath): boolean {
  return auto.name.trim() === "" && auto.strokes.length === 0;
}

/**
 * Path keys that belong to autos the scout has since removed.
 *
 * The pit form saves with `{ merge: true }`, and Firestore merges a map field
 * key by key — so writing only the surviving paths leaves the deleted ones
 * behind forever. They share a 1 MB document with the robot's photos, so
 * "harmless clutter" eventually becomes a save that bounces. The caller turns
 * these into `deleteField()` sentinels.
 */
export function removedAutoIds(
  previousIds: readonly string[],
  autos: readonly PitAuto[],
): string[] {
  const kept = new Set(autos.map((auto) => auto.id));
  return previousIds.filter((id) => !kept.has(id));
}
