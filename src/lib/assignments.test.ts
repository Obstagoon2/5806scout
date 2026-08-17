import { describe, expect, it } from "vitest";
import {
  assignMatchScouts,
  assignPitScouts,
  completedLast,
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

describe("completedLast", () => {
  it("sinks crossed-off entries to the bottom, keeping each group's order", () => {
    const teams = [11, 22, 33, 44, 55];
    const done = new Set([22, 44]);
    expect(completedLast(teams, (t) => done.has(t))).toEqual([
      11, 33, 55, 22, 44,
    ]);
  });

  it("handles all-done, none-done and empty lists", () => {
    expect(completedLast([1, 2], () => true)).toEqual([1, 2]);
    expect(completedLast([1, 2], () => false)).toEqual([1, 2]);
    expect(completedLast([], () => true)).toEqual([]);
  });

  it("leaves the source list untouched", () => {
    const teams = [1, 2, 3];
    completedLast(teams, (t) => t === 1);
    expect(teams).toEqual([1, 2, 3]);
  });
});

describe("assignMatchScouts", () => {
  const schedule = Array.from({ length: 8 }, (_, i) =>
    qual(i + 1, [1, 2, 3], [4, 5, 6]),
  );
  const six = ["a", "b", "c", "d", "e", "f"];

  it("covers all 6 teams of every match", () => {
    const slots = assignMatchScouts(schedule, ["a", "b", "c"], 4, seededRng(5));
    expect(slots.length).toBe(48);
    const q1 = slots
      .filter((s) => s.matchNumber === 1)
      .map((s) => s.teamNumber)
      .sort((x, y) => x - y);
    expect(q1).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps one scout on one station for the whole block, then hands off", () => {
    const pool = [...six, "g", "h", "i", "j", "k", "l"];
    const slots = assignMatchScouts(schedule, pool, 4, seededRng(9));
    // Team 1 always sits in the same station, so matches 1–4 are one scout's
    // shift and 5–8 are the next scout's.
    const onTeam1 = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (n) => slots.find((s) => s.matchNumber === n && s.teamNumber === 1)!.uid,
    );
    expect(new Set(onTeam1.slice(0, 4)).size).toBe(1);
    expect(new Set(onTeam1.slice(4)).size).toBe(1);
    expect(onTeam1[0]).not.toBe(onTeam1[4]);
  });

  it("works a crew of exactly six straight through — there's nobody to rotate in", () => {
    // Six scouts for six stations means every scout is needed every match, so
    // the block size can't buy anyone a break. The Team tab warns about this.
    const slots = assignMatchScouts(schedule, six, 4, seededRng(9));
    const perScout = new Map<string, number>();
    for (const s of slots) perScout.set(s.uid, (perScout.get(s.uid) ?? 0) + 1);
    expect([...perScout.values()]).toEqual(Array(6).fill(8));
  });

  it("uses 6 distinct scouts per match when the pool is big enough", () => {
    const slots = assignMatchScouts(schedule, six, 4, seededRng(9));
    for (const n of [1, 5, 8]) {
      const uids = slots.filter((s) => s.matchNumber === n).map((s) => s.uid);
      expect(new Set(uids).size).toBe(6);
    }
  });

  it("rotates every scout through when there are more scouts than stations", () => {
    const pool = [...six, "g", "h", "i", "j", "k", "l"];
    const slots = assignMatchScouts(schedule, pool, 4, seededRng(3));
    // Two blocks × 6 stations = 12 shifts, one for each of the 12 scouts.
    expect(new Set(slots.map((s) => s.uid)).size).toBe(12);
    const perScout = new Map<string, number>();
    for (const s of slots) perScout.set(s.uid, (perScout.get(s.uid) ?? 0) + 1);
    expect([...perScout.values()]).toEqual(Array(12).fill(4));
  });

  it("doubles a scout onto extra stations rather than leaving a robot unscouted", () => {
    const slots = assignMatchScouts(schedule, ["a", "b"], 8, seededRng(2));
    expect(slots.length).toBe(48);
    // Every match still has all 6 teams covered by somebody.
    for (const n of [1, 8]) {
      expect(slots.filter((s) => s.matchNumber === n).length).toBe(6);
    }
    expect(new Set(slots.map((s) => s.uid))).toEqual(new Set(["a", "b"]));
  });

  it("treats the whole schedule as one shift when the block is long enough", () => {
    const slots = assignMatchScouts(schedule, six, 200, seededRng(6));
    const onTeam1 = slots
      .filter((s) => s.teamNumber === 1)
      .map((s) => s.uid);
    expect(new Set(onTeam1).size).toBe(1);
  });

  it("clamps a nonsense block size instead of dropping matches", () => {
    expect(assignMatchScouts(schedule, six, 0, seededRng(1)).length).toBe(48);
    expect(assignMatchScouts(schedule, six, NaN, seededRng(1)).length).toBe(48);
  });

  it("returns empty for an empty scout pool", () => {
    expect(assignMatchScouts(schedule, [], 4)).toEqual([]);
  });
});
