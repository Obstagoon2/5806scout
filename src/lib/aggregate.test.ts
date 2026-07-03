import { describe, expect, it } from "vitest";
import { aggregateByTeam, type MatchSubmission } from "./aggregate";
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
