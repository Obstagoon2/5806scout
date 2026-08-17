// Scouting subteams: named groups of scouts, each flagged for match scouting,
// pit scouting, or both. Stored at teams/{teamId}/config/subteams and edited
// on the Team tab. Assignment generation reads them to decide who is eligible
// and — for match scouting — which group is on shift for which block of
// matches. Pure logic lives here so shift rotation is testable without React.

/** What a subteam is eligible to scout. */
export type SubteamDuty = "match" | "pit" | "both";

export const DUTY_LABELS: Record<SubteamDuty, string> = {
  match: "Match scouting",
  pit: "Pit scouting",
  both: "Match + pit",
};

export interface Subteam {
  id: string;
  name: string;
  duty: SubteamDuty;
}

export interface SubteamsDoc {
  subteams: Subteam[];
  /** uid → subteam id. Exactly one subteam per scout. */
  memberships: Record<string, string>;
  /** Matches a scout covers in one sitting before rotating off. */
  matchesPerSitting: number;
  updatedAt: number;
}

/**
 * A full shift is long enough to be worth walking to the stands for and short
 * enough that nobody misses lunch. Teams override it on the Team tab.
 */
export const DEFAULT_MATCHES_PER_SITTING = 12;

export const MIN_MATCHES_PER_SITTING = 1;
export const MAX_MATCHES_PER_SITTING = 200;

export function clampMatchesPerSitting(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MATCHES_PER_SITTING;
  return Math.min(
    MAX_MATCHES_PER_SITTING,
    Math.max(MIN_MATCHES_PER_SITTING, Math.floor(value)),
  );
}

export function emptySubteamsDoc(): SubteamsDoc {
  return {
    subteams: [],
    memberships: {},
    matchesPerSitting: DEFAULT_MATCHES_PER_SITTING,
    updatedAt: 0,
  };
}

export function scoutsMatch(duty: SubteamDuty): boolean {
  return duty === "match" || duty === "both";
}

export function scoutsPit(duty: SubteamDuty): boolean {
  return duty === "pit" || duty === "both";
}

/**
 * Every scout lands in exactly one subteam. Explicit memberships win; anyone
 * left over (a new invite, or someone whose subteam was deleted) is placed in
 * the smallest subteam so groups stay balanced without an admin touching
 * anything. Placement is deterministic — same roster in, same result out — so
 * the dropdown on the Team tab doesn't reshuffle itself between renders.
 *
 * Returns uid → subteam id, covering every uid passed in (empty when there
 * are no subteams to place them into).
 */
export function resolveMemberships(
  subteams: readonly Subteam[],
  memberships: Readonly<Record<string, string>>,
  scoutUids: readonly string[],
): Record<string, string> {
  if (subteams.length === 0) return {};

  const valid = new Set(subteams.map((group) => group.id));
  const resolved: Record<string, string> = {};
  const sizes = new Map(subteams.map((group) => [group.id, 0]));

  const unplaced: string[] = [];
  for (const uid of scoutUids) {
    const explicit = memberships[uid];
    if (explicit && valid.has(explicit)) {
      resolved[uid] = explicit;
      sizes.set(explicit, (sizes.get(explicit) ?? 0) + 1);
    } else {
      unplaced.push(uid);
    }
  }

  // Sorted so placement doesn't depend on the roster's arrival order.
  for (const uid of [...unplaced].sort()) {
    let smallest = subteams[0].id;
    for (const group of subteams) {
      if ((sizes.get(group.id) ?? 0) < (sizes.get(smallest) ?? 0)) {
        smallest = group.id;
      }
    }
    resolved[uid] = smallest;
    sizes.set(smallest, (sizes.get(smallest) ?? 0) + 1);
  }

  return resolved;
}

/** The uids in each subteam, in the order the scouts were given. */
export function membersBySubteam(
  subteams: readonly Subteam[],
  resolved: Readonly<Record<string, string>>,
  scoutUids: readonly string[],
): Record<string, string[]> {
  const byId: Record<string, string[]> = Object.fromEntries(
    subteams.map((group) => [group.id, [] as string[]]),
  );
  for (const uid of scoutUids) {
    const id = resolved[uid];
    if (id && byId[id]) byId[id].push(uid);
  }
  return byId;
}

/** One subteam's turn at the schedule: the group and who's in it. */
export interface ShiftGroup {
  id: string;
  name: string;
  uids: string[];
}

/**
 * The subteams eligible for a duty that actually have members, in the order
 * they were defined. Empty groups are dropped — a shift handed to a group with
 * nobody in it would leave those matches unscouted.
 */
export function shiftGroupsFor(
  duty: "match" | "pit",
  subteams: readonly Subteam[],
  resolved: Readonly<Record<string, string>>,
  scoutUids: readonly string[],
): ShiftGroup[] {
  const eligible = subteams.filter((group) =>
    duty === "match" ? scoutsMatch(group.duty) : scoutsPit(group.duty),
  );
  const byId = membersBySubteam(subteams, resolved, scoutUids);
  return eligible
    .map((group) => ({ id: group.id, name: group.name, uids: byId[group.id] ?? [] }))
    .filter((group) => group.uids.length > 0);
}

/** Every uid eligible for a duty, pooled across subteams. */
export function eligibleUids(
  duty: "match" | "pit",
  subteams: readonly Subteam[],
  resolved: Readonly<Record<string, string>>,
  scoutUids: readonly string[],
): string[] {
  return shiftGroupsFor(duty, subteams, resolved, scoutUids).flatMap(
    (group) => group.uids,
  );
}

/**
 * Which group covers each block of matches: block 0 to the first group, block
 * 1 to the second, wrapping around. `matchCount` matches split into blocks of
 * `matchesPerSitting`, so with 2 groups and a sitting of 12, group A takes
 * Q1–Q12 and Q25–Q36 while group B takes Q13–Q24.
 *
 * Returns one entry per match, index-aligned with the schedule.
 */
export function shiftPlan(
  matchCount: number,
  groupCount: number,
  matchesPerSitting: number,
): number[] {
  if (groupCount <= 0) return [];
  const sitting = clampMatchesPerSitting(matchesPerSitting);
  return Array.from(
    { length: Math.max(0, matchCount) },
    (_, i) => Math.floor(i / sitting) % groupCount,
  );
}
