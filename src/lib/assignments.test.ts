import { describe, expect, it } from "vitest";
import {
  assignMatchScouts,
  assignPitScouts,
  shuffle,
  slotKey,
  upcomingSlots,
} from "./assignments";
import type { EventMatch } from "./eventData";

// Tiny deterministic rng for reproducible tests.
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function qual(n: number, red: number[], blue: number[]): EventMatch {
  return {
    key: `2026test_qm${n}`,
    compLevel: "qm",
    matchNumber: n,
    red,
    blue,
    redScore: null,
    blueScore: null,
    winner: null,
    scheduledTime: null,
  };
}

describe("shuffle", () => {
  it("keeps the same elements and doesn't mutate the input", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seededRng(1));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("assignPitScouts", () => {
  it("assigns every team exactly once with even counts", () => {
    const teams = Array.from({ length: 20 }, (_, i) => 100 + i);
    const byScout = assignPitScouts(teams, ["a", "b", "c"], seededRng(7));

    const all = Object.values(byScout).flat();
    expect(all.length).toBe(20);
    expect(new Set(all).size).toBe(20);
    // 20 teams / 3 scouts → counts of 7, 7, 6 in some order.
    const counts = Object.values(byScout)
      .map((t) => t.length)
      .sort();
    expect(counts).toEqual([6, 7, 7]);
  });

  it("includes scouts even when there are more scouts than teams", () => {
    const byScout = assignPitScouts([1, 2], ["a", "b", "c"], seededRng(3));
    expect(Object.keys(byScout).sort()).toEqual(["a", "b", "c"]);
    expect(Object.values(byScout).flat().length).toBe(2);
  });

  it("returns empty for an empty scout pool", () => {
    expect(assignPitScouts([1, 2, 3], [])).toEqual({});
  });
});

describe("assignMatchScouts", () => {
  const matches = [
    qual(1, [1, 2, 3], [4, 5, 6]),
    qual(2, [7, 8, 9], [10, 11, 12]),
  ];

  it("covers all 6 teams of every match", () => {
    const slots = assignMatchScouts(matches, ["a", "b", "c"], seededRng(5));
    expect(slots.length).toBe(12);
    const q1Teams = slots
      .filter((s) => s.matchNumber === 1)
      .map((s) => s.teamNumber)
      .sort((x, y) => x - y);
    expect(q1Teams).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("uses 6 distinct scouts per match when the pool is big enough", () => {
    const pool = ["a", "b", "c", "d", "e", "f", "g"];
    const slots = assignMatchScouts(matches, pool, seededRng(9));
    for (const n of [1, 2]) {
      const uids = slots.filter((s) => s.matchNumber === n).map((s) => s.uid);
      expect(new Set(uids).size).toBe(6);
    }
  });

  it("keeps total load even across the rotation", () => {
    const slots = assignMatchScouts(matches, ["a", "b", "c"], seededRng(2));
    const perScout = new Map<string, number>();
    for (const s of slots) perScout.set(s.uid, (perScout.get(s.uid) ?? 0) + 1);
    // 12 slots / 3 scouts → exactly 4 each.
    expect([...perScout.values()]).toEqual([4, 4, 4]);
  });

  it("returns empty for an empty scout pool", () => {
    expect(assignMatchScouts(matches, [])).toEqual([]);
  });
});

describe("upcomingSlots", () => {
  it("finds the scout's slots in the next unplayed matches, ordered", () => {
    const played = { ...qual(1, [1, 2, 3], [4, 5, 6]), redScore: 10, blueScore: 5 };
    const schedule = [played, qual(2, [7, 8, 9], [10, 11, 12]), qual(3, [1, 2, 3], [7, 8, 9]), qual(4, [4, 5, 6], [10, 11, 12])];
    const slots = [
      { matchKey: played.key, compLevel: "qm", matchNumber: 1, teamNumber: 1, alliance: "red" as const, uid: "me" },
      { matchKey: "2026test_qm3", compLevel: "qm", matchNumber: 3, teamNumber: 8, alliance: "blue" as const, uid: "me" },
      { matchKey: "2026test_qm2", compLevel: "qm", matchNumber: 2, teamNumber: 7, alliance: "red" as const, uid: "me" },
      { matchKey: "2026test_qm2", compLevel: "qm", matchNumber: 2, teamNumber: 10, alliance: "blue" as const, uid: "other" },
      { matchKey: "2026test_qm4", compLevel: "qm", matchNumber: 4, teamNumber: 4, alliance: "red" as const, uid: "me" },
    ];

    const result = upcomingSlots(slots, schedule, "me");
    // Played qm1 and beyond-lookahead qm4 are excluded; qm2 (up now) sorts
    // before qm3 (up next); "other"'s slot is ignored.
    expect(result.map(({ slot, position }) => [slot.matchNumber, position])).toEqual([
      [2, 0],
      [3, 1],
    ]);
  });
});

describe("slotKey", () => {
  it("combines match key and team number", () => {
    expect(slotKey({ matchKey: "2026test_qm2", teamNumber: 7 })).toBe(
      "2026test_qm2:7",
    );
  });
});
