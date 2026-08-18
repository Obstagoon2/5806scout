// Alliance selection board + playoff odds.
//
// Eight alliances of three (CAPTAIN, 1st pick, 2nd pick) play the double
// elimination bracket in game manual §10.6.2: thirteen MATCHES, then a Finals
// where the first ALLIANCE to win two MATCHES takes the event. BACKUP TEAMS
// (§10.6.3) are deliberately not modelled — they're recruited mid-playoffs
// and never change who's in the bracket.
//
// Slots are stored flat rather than as an array of arrays because Firestore
// refuses nested arrays; allianceOf/slotOf do the index math.

import { predictAlliance, redWinProbability, type TeamStrengthProfile } from "@/lib/drive";

export const ALLIANCE_COUNT = 8;
export const ALLIANCE_SIZE = 3;
export const SLOT_COUNT = ALLIANCE_COUNT * ALLIANCE_SIZE;

/** What each slot in an alliance is called during selection. */
export const SLOT_LABELS: readonly string[] = ["Captain", "1st pick", "2nd pick"];

/** Flat board of SLOT_COUNT entries; null is an unfilled slot. */
export type AllianceSlots = readonly (number | null)[];

/** Stored at teams/{teamId}/config/alliances. */
export interface AllianceBoardDoc {
  slots: (number | null)[];
  updatedAt: number;
}

export function emptySlots(): (number | null)[] {
  return new Array<number | null>(SLOT_COUNT).fill(null);
}

/** Pad or trim a stored board to the current shape — a short array reads as empty tail slots. */
export function normalizeSlots(slots: readonly (number | null)[] | undefined): (number | null)[] {
  const next = emptySlots();
  for (let i = 0; i < SLOT_COUNT; i++) {
    const value = slots?.[i];
    if (typeof value === "number") next[i] = value;
  }
  return next;
}

export function slotIndex(alliance: number, slot: number): number {
  return alliance * ALLIANCE_SIZE + slot;
}

/** The three teams on one alliance, in slot order. */
export function allianceTeams(slots: AllianceSlots, alliance: number): (number | null)[] {
  return Array.from({ length: ALLIANCE_SIZE }, (_, slot) => slots[slotIndex(alliance, slot)] ?? null);
}

/**
 * Put a team in a slot. A team can only sit on one alliance, so this clears
 * it from wherever else it was — dragging a team down the board moves it
 * rather than cloning it.
 */
export function assignSlot(
  slots: AllianceSlots,
  alliance: number,
  slot: number,
  team: number | null,
): (number | null)[] {
  const next = normalizeSlots(slots);
  if (team !== null) {
    for (let i = 0; i < next.length; i++) {
      if (next[i] === team) next[i] = null;
    }
  }
  next[slotIndex(alliance, slot)] = team;
  return next;
}

export function clearSlot(slots: AllianceSlots, alliance: number, slot: number): (number | null)[] {
  return assignSlot(slots, alliance, slot, null);
}

/** Every team already placed somewhere on the board. */
export function takenTeams(slots: AllianceSlots): Set<number> {
  const taken = new Set<number>();
  for (const team of slots) {
    if (team !== null) taken.add(team);
  }
  return taken;
}

/** True once all 24 slots are filled — the odds only mean anything then. */
export function isBoardFull(slots: AllianceSlots): boolean {
  return normalizeSlots(slots).every((team) => team !== null);
}

/** Where an alliance in a bracket MATCH comes from. */
export type SlotSource =
  | { from: "seed"; seed: number }
  | { from: "winner"; match: number }
  | { from: "loser"; match: number };

export interface BracketMatch {
  /** Playoff MATCH number, as the audience display labels it. */
  number: number;
  red: SlotSource;
  blue: SlotSource;
}

/**
 * The 8-alliance double elimination bracket (manual Figure 10-2). Round 1
 * seeds the higher-ranked ALLIANCE red; every later pairing follows the
 * figure. Losing in the Upper bracket drops you to the Lower bracket, losing
 * there ends your event — so the loser of MATCH 12 finishes 4th and the loser
 * of MATCH 13 finishes 3rd, matching the β table in §11.1.3.
 */
export const PLAYOFF_BRACKET: readonly BracketMatch[] = [
  { number: 1, red: { from: "seed", seed: 1 }, blue: { from: "seed", seed: 8 } },
  { number: 2, red: { from: "seed", seed: 4 }, blue: { from: "seed", seed: 5 } },
  { number: 3, red: { from: "seed", seed: 2 }, blue: { from: "seed", seed: 7 } },
  { number: 4, red: { from: "seed", seed: 3 }, blue: { from: "seed", seed: 6 } },
  { number: 5, red: { from: "loser", match: 1 }, blue: { from: "loser", match: 2 } },
  { number: 6, red: { from: "loser", match: 3 }, blue: { from: "loser", match: 4 } },
  { number: 7, red: { from: "winner", match: 1 }, blue: { from: "winner", match: 2 } },
  { number: 8, red: { from: "winner", match: 3 }, blue: { from: "winner", match: 4 } },
  { number: 9, red: { from: "loser", match: 7 }, blue: { from: "winner", match: 6 } },
  { number: 10, red: { from: "loser", match: 8 }, blue: { from: "winner", match: 5 } },
  { number: 11, red: { from: "winner", match: 7 }, blue: { from: "winner", match: 8 } },
  { number: 12, red: { from: "winner", match: 9 }, blue: { from: "winner", match: 10 } },
  { number: 13, red: { from: "loser", match: 11 }, blue: { from: "winner", match: 12 } },
];

/** The two ALLIANCES left standing meet in the Finals (§10.6.2.2). */
const FINALS_UPPER = 11;
const FINALS_LOWER = 13;

/**
 * Chance of taking a Finals series given a per-MATCH win probability. The
 * Finals are first-to-two, so it's WW plus the two ways to go 2-1:
 * p² + 2p²(1-p). Ties (which the manual replays rather than breaks) are
 * treated as if they never happened.
 */
export function bestOfThree(p: number): number {
  return p * p * (3 - 2 * p);
}

/**
 * Exact championship probability per seed, given each alliance's predicted
 * points. Every one of the 2^13 ways the bracket can play out is enumerated
 * and weighted — 8192 branches is cheap enough to be exact, so the numbers
 * don't shimmer the way a Monte Carlo run would when nothing changed.
 *
 * `strengths[i]` is the alliance seeded i+1.
 */
export function championshipOdds(strengths: readonly number[]): number[] {
  const odds = new Array<number>(ALLIANCE_COUNT).fill(0);
  if (strengths.length !== ALLIANCE_COUNT) return odds;

  // Indexed by MATCH number, so slot 0 goes unused.
  const winner = new Array<number>(PLAYOFF_BRACKET.length + 1).fill(0);
  const loser = new Array<number>(PLAYOFF_BRACKET.length + 1).fill(0);

  const seedOf = (source: SlotSource): number => {
    switch (source.from) {
      case "seed":
        return source.seed;
      case "winner":
        return winner[source.match];
      case "loser":
        return loser[source.match];
    }
  };

  const outcomes = 1 << PLAYOFF_BRACKET.length;
  for (let outcome = 0; outcome < outcomes; outcome++) {
    let probability = 1;
    for (let i = 0; i < PLAYOFF_BRACKET.length; i++) {
      const match = PLAYOFF_BRACKET[i];
      const red = seedOf(match.red);
      const blue = seedOf(match.blue);
      const redWins = redWinProbability(strengths[red - 1], strengths[blue - 1]);
      if ((outcome >> i) & 1) {
        winner[match.number] = blue;
        loser[match.number] = red;
        probability *= 1 - redWins;
      } else {
        winner[match.number] = red;
        loser[match.number] = blue;
        probability *= redWins;
      }
    }
    const upper = winner[FINALS_UPPER];
    const lower = winner[FINALS_LOWER];
    const upperSeries = bestOfThree(
      redWinProbability(strengths[upper - 1], strengths[lower - 1]),
    );
    odds[upper - 1] += probability * upperSeries;
    odds[lower - 1] += probability * (1 - upperSeries);
  }

  return odds;
}

/** One alliance's predicted points, plus the teams we know nothing about. */
export interface AllianceStrength {
  points: number;
  /** Placed teams with neither scout data nor EPA — the total is partial. */
  unknownTeams: number[];
  /** Slots still empty. */
  emptySlots: number;
}

export function allianceStrengths(
  slots: AllianceSlots,
  profiles: ReadonlyMap<number, TeamStrengthProfile>,
): AllianceStrength[] {
  return Array.from({ length: ALLIANCE_COUNT }, (_, alliance) => {
    const teams = allianceTeams(slots, alliance);
    const placed = teams.filter((team): team is number => team !== null);
    const prediction = predictAlliance(placed, profiles);
    return {
      points: prediction.points ?? 0,
      unknownTeams: prediction.unknownTeams,
      emptySlots: teams.length - placed.length,
    };
  });
}

/**
 * Championship odds for a filled board, or null while any slot is empty —
 * a half-drafted bracket has no meaningful answer to "who wins it all".
 */
export function boardOdds(
  slots: AllianceSlots,
  profiles: ReadonlyMap<number, TeamStrengthProfile>,
): number[] | null {
  if (!isBoardFull(slots)) return null;
  return championshipOdds(allianceStrengths(slots, profiles).map((s) => s.points));
}
