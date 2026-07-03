import type { EventTeam } from "@/lib/eventData";

// Stored at teams/{teamId}/config/picklist. `order` is the ranked list of
// team numbers; `struck` marks teams already picked/unavailable during
// alliance selection (kept in place but crossed out).
export interface PicklistDoc {
  order: number[];
  struck: number[];
  updatedAt: number;
}

/**
 * Reconcile a saved ranking with the current event team list: keep the saved
 * relative order for teams still at the event, drop teams that left, and
 * append newly-appeared teams at the bottom sorted by EPA (best first) so
 * strong newcomers are easy to spot.
 */
export function reconcileOrder(
  savedOrder: readonly number[],
  eventTeams: readonly EventTeam[],
): number[] {
  const present = new Set(eventTeams.map((t) => t.teamNumber));
  const kept = savedOrder.filter((n) => present.has(n));
  const seen = new Set(kept);

  const added = eventTeams
    .filter((t) => !seen.has(t.teamNumber))
    .sort((a, b) => (b.epa ?? -Infinity) - (a.epa ?? -Infinity))
    .map((t) => t.teamNumber);

  return [...kept, ...added];
}

/** Move the item at `from` to position `to`, returning a new array. */
export function moveItem(list: readonly number[], from: number, to: number): number[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) {
    return [...list];
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function toggleStruck(struck: readonly number[], team: number): number[] {
  return struck.includes(team)
    ? struck.filter((n) => n !== team)
    : [...struck, team];
}
