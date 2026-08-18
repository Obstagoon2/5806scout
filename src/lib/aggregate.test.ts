import { describe, expect, it } from "vitest";
import {
  aggregateByTeam,
  interquartileRange,
  median,
  percentileOfSorted,
  type MatchSubmission,
} from "./aggregate";
import type { FormSection } from "./formSchema";

const sections: readonly FormSection[] = [
  {
    title: "Teleop",
    fields: [
      { kind: "counter", id: "scored", label: "Scored" },
      { kind: "select", id: "endgame", label: "Endgame", options: ["None", "Climb"] },
    ],
  },
];

function submission(
  overrides: Partial<MatchSubmission> & { scoutedTeam: string },
): MatchSubmission {
  return {
    id: Math.random().toString(36).slice(2),
    matchNumber: 1,
    alliance: "red",
    values: {},
    scoutName: "Test",
    ...overrides,
  };
}

describe("aggregateByTeam", () => {
  it("averages counter fields per team", () => {
    const result = aggregateByTeam(sections, [
      submission({ scoutedTeam: "254", values: { scored: 4, endgame: "Climb" } }),
      submission({ scoutedTeam: "254", values: { scored: 2, endgame: "Climb" } }),
      submission({ scoutedTeam: "118", values: { scored: 1, endgame: "None" } }),
    ]);

    expect(result).toHaveLength(2);
    const team254 = result.find((r) => r.team === "254");
    expect(team254?.matches).toBe(2);
    expect(team254?.averages.scored).toBe(3);
    expect(team254?.modes.endgame).toBe("Climb");
  });

  it("treats missing counter values as 0 and never-answered selects as null", () => {
    const result = aggregateByTeam(sections, [
      submission({ scoutedTeam: "999", values: { scored: 3 } }),
      submission({ scoutedTeam: "999", values: {} }),
    ]);

    expect(result[0].averages.scored).toBe(1.5);
    expect(result[0].modes.endgame).toBeNull();
  });

  it("sorts teams numerically", () => {
    const result = aggregateByTeam(sections, [
      submission({ scoutedTeam: "1114" }),
      submission({ scoutedTeam: "254" }),
      submission({ scoutedTeam: "33" }),
    ]);
    expect(result.map((r) => r.team)).toEqual(["33", "254", "1114"]);
  });
});

describe("samples", () => {
  it("keeps every per-match value behind the average", () => {
    const [agg] = aggregateByTeam(sections, [
      submission({ scoutedTeam: "254", values: { scored: 10 } }),
      submission({ scoutedTeam: "254", values: { scored: 20 } }),
      // Never answered — counts as 0, exactly as it does in the average.
      submission({ scoutedTeam: "254", values: {} }),
    ]);
    expect(agg.samples.scored).toEqual([10, 20, 0]);
    expect(agg.averages.scored).toBeCloseTo(10);
    expect(median(agg.samples.scored)).toBe(10);
  });
});

describe("percentileOfSorted", () => {
  it("interpolates between neighbours (the R-7 / PERCENTILE.INC definition)", () => {
    const sorted = [1, 2, 3, 4];
    expect(percentileOfSorted(sorted, 0.25)).toBeCloseTo(1.75);
    expect(percentileOfSorted(sorted, 0.5)).toBeCloseTo(2.5);
    expect(percentileOfSorted(sorted, 0.75)).toBeCloseTo(3.25);
  });

  it("lands exactly on a value when the position is whole", () => {
    expect(percentileOfSorted([10, 20, 30], 0.5)).toBe(20);
  });

  it("has nothing to say about an empty sample", () => {
    expect(percentileOfSorted([], 0.5)).toBeNull();
  });

  it("returns the lone value of a one-match sample", () => {
    expect(percentileOfSorted([7], 0.25)).toBe(7);
  });
});

describe("median", () => {
  it("takes the middle of an odd sample", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("splits the difference on an even sample", () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5);
  });

  it("shrugs off the one match that went wrong", () => {
    // A robot that died once: the mean drops to 32, the median holds.
    const matches = [40, 41, 40, 39, 0];
    expect(median(matches)).toBe(40);
  });

  it("does not reorder the caller's array", () => {
    const matches = [3, 1, 2];
    median(matches);
    expect(matches).toEqual([3, 1, 2]);
  });

  it("is null with no matches scouted", () => {
    expect(median([])).toBeNull();
  });
});

describe("interquartileRange", () => {
  it("measures the width of the middle half", () => {
    expect(interquartileRange([1, 2, 3, 4])).toBeCloseTo(1.5);
  });

  it("is zero for a team that does the same thing every match", () => {
    expect(interquartileRange([12, 12, 12, 12])).toBe(0);
  });

  it("separates a steady team from a coin flip with the same median", () => {
    const steady = [38, 39, 40, 41, 42];
    const swingy = [10, 25, 40, 55, 70];
    expect(median(steady)).toBe(median(swingy));
    expect(interquartileRange(steady)).toBeLessThan(
      interquartileRange(swingy) as number,
    );
  });

  it("is null with no matches scouted", () => {
    expect(interquartileRange([])).toBeNull();
  });
});
