import { describe, expect, it } from "vitest";
import {
  ALLIANCE_COUNT,
  SLOT_COUNT,
  allianceStrengths,
  allianceTeams,
  assignSlot,
  bestOfThree,
  boardOdds,
  championshipOdds,
  clearSlot,
  emptySlots,
  isBoardFull,
  normalizeSlots,
  PLAYOFF_BRACKET,
  takenTeams,
} from "./alliances";
import type { TeamStrengthProfile } from "./drive";

/** A board where alliance n is teams n00, n01, n02. */
function filledBoard(): (number | null)[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) => 100 + i);
}

describe("slots", () => {
  it("starts empty", () => {
    expect(emptySlots()).toHaveLength(SLOT_COUNT);
    expect(isBoardFull(emptySlots())).toBe(false);
    expect(takenTeams(emptySlots()).size).toBe(0);
  });

  it("seats a team and reads it back on the right alliance", () => {
    const slots = assignSlot(emptySlots(), 3, 1, 254);
    expect(allianceTeams(slots, 3)).toEqual([null, 254, null]);
    expect(allianceTeams(slots, 0)).toEqual([null, null, null]);
  });

  it("moves a team rather than cloning it onto two alliances", () => {
    let slots = assignSlot(emptySlots(), 0, 0, 5806);
    slots = assignSlot(slots, 5, 2, 5806);
    expect(allianceTeams(slots, 0)).toEqual([null, null, null]);
    expect(allianceTeams(slots, 5)).toEqual([null, null, 5806]);
    expect(takenTeams(slots)).toEqual(new Set([5806]));
  });

  it("clears a slot", () => {
    const slots = clearSlot(assignSlot(emptySlots(), 2, 0, 118), 2, 0);
    expect(isBoardFull(slots)).toBe(false);
    expect(takenTeams(slots).size).toBe(0);
  });

  it("pads a short stored board instead of leaving holes", () => {
    expect(normalizeSlots([1, 2])).toHaveLength(SLOT_COUNT);
    expect(normalizeSlots(undefined)).toEqual(emptySlots());
  });

  it("is full only with every slot seated", () => {
    expect(isBoardFull(filledBoard())).toBe(true);
    expect(isBoardFull(clearSlot(filledBoard(), 7, 2))).toBe(false);
  });
});

describe("bracket", () => {
  it("runs the manual's thirteen playoff MATCHES", () => {
    expect(PLAYOFF_BRACKET.map((m) => m.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
  });

  it("seeds round 1 the way the manual pairs them", () => {
    const round1 = PLAYOFF_BRACKET.slice(0, 4).map((m) => [
      m.red.from === "seed" ? m.red.seed : null,
      m.blue.from === "seed" ? m.blue.seed : null,
    ]);
    expect(round1).toEqual([
      [1, 8],
      [4, 5],
      [2, 7],
      [3, 6],
    ]);
  });

  it("only ever references MATCHES that have already been played", () => {
    for (let i = 0; i < PLAYOFF_BRACKET.length; i++) {
      const match = PLAYOFF_BRACKET[i];
      for (const source of [match.red, match.blue]) {
        if (source.from === "seed") continue;
        const feeder = PLAYOFF_BRACKET.findIndex(
          (m) => m.number === source.match,
        );
        expect(feeder).toBeGreaterThanOrEqual(0);
        expect(feeder).toBeLessThan(i);
      }
    }
  });
});

describe("bestOfThree", () => {
  it("is a coin flip between even alliances", () => {
    expect(bestOfThree(0.5)).toBeCloseTo(0.5, 10);
  });

  it("sharpens an edge — a series favours the better alliance more than one MATCH", () => {
    expect(bestOfThree(0.6)).toBeGreaterThan(0.6);
    expect(bestOfThree(0.4)).toBeLessThan(0.4);
  });

  it("splits the two sides of a series between them", () => {
    expect(bestOfThree(0.7) + bestOfThree(0.3)).toBeCloseTo(1, 10);
  });
});

describe("championshipOdds", () => {
  it("gives every seed the same shot when the alliances are identical", () => {
    const odds = championshipOdds(new Array(ALLIANCE_COUNT).fill(100));
    for (const chance of odds) expect(chance).toBeCloseTo(1 / 8, 10);
  });

  it("always adds up to exactly one champion", () => {
    const odds = championshipOdds([180, 165, 150, 140, 130, 120, 90, 60]);
    expect(odds.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("ranks a stronger alliance ahead of a weaker one", () => {
    const odds = championshipOdds([180, 165, 150, 140, 130, 120, 90, 60]);
    for (let i = 1; i < odds.length; i++) {
      expect(odds[i - 1]).toBeGreaterThan(odds[i]);
    }
  });

  it("does not hand the title to seeding alone — a stacked 8 seed leads", () => {
    const odds = championshipOdds([100, 100, 100, 100, 100, 100, 100, 300]);
    expect(odds[7]).toBeGreaterThan(Math.max(...odds.slice(0, 7)));
  });

  it("survives a double elimination loss — nobody is at zero", () => {
    const odds = championshipOdds([300, 100, 100, 100, 100, 100, 100, 100]);
    for (const chance of odds) expect(chance).toBeGreaterThan(0);
  });

  it("refuses a board that is not eight alliances", () => {
    expect(championshipOdds([100, 100])).toEqual(new Array(8).fill(0));
  });
});

describe("board odds", () => {
  const profiles = new Map<number, TeamStrengthProfile>(
    Array.from({ length: SLOT_COUNT }, (_, i) => [
      100 + i,
      {
        teamNumber: 100 + i,
        points: 50,
        source: "scouted" as const,
        matches: 5,
        strengths: [],
        weaknesses: [],
      },
    ]),
  );

  it("stays quiet until all eight alliances are drafted", () => {
    expect(boardOdds(clearSlot(filledBoard(), 4, 2), profiles)).toBeNull();
  });

  it("splits evenly across identical alliances", () => {
    const odds = boardOdds(filledBoard(), profiles);
    expect(odds).not.toBeNull();
    for (const chance of odds ?? []) expect(chance).toBeCloseTo(1 / 8, 10);
  });

  it("names the teams it has no data for", () => {
    const slots = assignSlot(filledBoard(), 0, 0, 9999);
    const strengths = allianceStrengths(slots, profiles);
    expect(strengths[0].unknownTeams).toEqual([9999]);
    expect(strengths[0].points).toBe(100);
    expect(strengths[0].emptySlots).toBe(0);
  });

  it("reports empty slots rather than pretending an alliance is short", () => {
    const strengths = allianceStrengths(emptySlots(), profiles);
    expect(strengths[0].emptySlots).toBe(3);
    expect(strengths[0].points).toBe(0);
  });
});
