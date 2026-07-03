import type { EventTeam } from "@/lib/eventData";

// Stored at teams/{teamId}/config/picklist. `order` is the ranked list of
// team numbers; `struck` marks teams already picked/unavailable during
// alliance selection (kept in place but crossed out); `doNotPick` is the
// ordered list of teams pulled out of the ranking entirely.
export interface PicklistDoc {
  order: number[];
  struck: number[];
  doNotPick?: number[];
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

/**
 * Split a reconciled ranking into the pickable order and the Do Not Pick
 * list. DNP teams keep their saved DNP order; teams that left the event are
 * dropped from both lists.
 */
export function splitDoNotPick(
  reconciled: readonly number[],
  savedDoNotPick: readonly number[],
): { order: number[]; doNotPick: number[] } {
  const present = new Set(reconciled);
  const doNotPick = savedDoNotPick.filter((n) => present.has(n));
  const dnpSet = new Set(doNotPick);
  return {
    order: reconciled.filter((n) => !dnpSet.has(n)),
    doNotPick,
  };
}

/** Move a team from the ranking to the bottom of the Do Not Pick list. */
export function moveToDoNotPick(
  order: readonly number[],
  doNotPick: readonly number[],
  team: number,
): { order: number[]; doNotPick: number[] } {
  if (!order.includes(team)) {
    return { order: [...order], doNotPick: [...doNotPick] };
  }
  return {
    order: order.filter((n) => n !== team),
    doNotPick: [...doNotPick.filter((n) => n !== team), team],
  };
}

/** Return a Do Not Pick team to the bottom of the ranking. */
export function restoreFromDoNotPick(
  order: readonly number[],
  doNotPick: readonly number[],
  team: number,
): { order: number[]; doNotPick: number[] } {
  if (!doNotPick.includes(team)) {
    return { order: [...order], doNotPick: [...doNotPick] };
  }
  return {
    order: [...order.filter((n) => n !== team), team],
    doNotPick: doNotPick.filter((n) => n !== team),
  };
}
