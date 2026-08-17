import { describe, expect, it } from "vitest";
import type { TeamAggregate } from "@/lib/aggregate";
import type { EventMatch, EventTeam } from "@/lib/eventData";
import type { FormSection } from "@/lib/formSchema";
import {
  buildTeamProfiles,
  eventFieldAverages,
  predictAlliance,
  predictMatch,
  redWinProbability,
  scoutedPoints,
  upcomingTeamMatches,
} from "@/lib/drive";

const SECTIONS: FormSection[] = [
  {
    title: "Teleop",
    fields: [
      { kind: "counter", id: "low", label: "Scored — low" },
      { kind: "counter", id: "high", label: "Scored — high" },
      { kind: "select", id: "endgame", label: "Endgame", options: ["None", "Climb"] },
    ],
  },
];

function aggregate(
  team: string,
  averages: Record<string, number>,
  matches = 4,
): TeamAggregate {
  return { team, matches, averages, modes: { endgame: "Climb" } };
}

function eventTeam(teamNumber: number, epa: number | null): EventTeam {
  return { teamNumber, nickname: `Team ${teamNumber}`, city: "", epa, epaRank: null };
}

function match(overrides: Partial<EventMatch>): EventMatch {
  return {
    key: "2026test_qm1",
    compLevel: "qm",
    matchNumber: 1,
    red: [1, 2, 3],
    blue: [4, 5, 6],
    redScore: null,
    blueScore: null,
    winner: null,
    scheduledTime: null,
    ...overrides,
  };
}

describe("scoutedPoints", () => {
  it("weights counter averages, defaulting unset weights to 1", () => {
    const agg = aggregate("100", { low: 3, high: 2 });
    expect(scoutedPoints(SECTIONS, agg, { high: 5 })).toBe(3 * 1 + 2 * 5);
  });

  it("ignores select fields and missing averages", () => {
    const agg = aggregate("100", { low: 4 });
    expect(scoutedPoints(SECTIONS, agg, {})).toBe(4);
  });

  it("adds REBUILT climb points from the modal select answers", () => {
    const agg: TeamAggregate = {
      team: "100",
      matches: 4,
      averages: { low: 3 },
      modes: { endgame: "Level 2", autoClimb: "Climbed (L1)" },
    };
    expect(scoutedPoints(SECTIONS, agg, {})).toBe(3 + 20 + 15);
  });

  it("scores unlisted climb answers (failed, none) as zero", () => {
    const agg: TeamAggregate = {
      team: "100",
      matches: 4,
      averages: {},
      modes: { endgame: "Failed attempt", autoClimb: "No attempt" },
    };
    expect(scoutedPoints(SECTIONS, agg, {})).toBe(0);
  });
});

describe("eventFieldAverages", () => {
  it("averages each counter across scouted teams", () => {
    const baseline = eventFieldAverages(SECTIONS, [
      aggregate("1", { low: 2, high: 4 }),
      aggregate("2", { low: 6, high: 0 }),
    ]);
    expect(baseline).toEqual({ low: 4, high: 2 });
  });

  it("is empty with no data", () => {
    expect(eventFieldAverages(SECTIONS, [])).toEqual({});
  });
});

describe("buildTeamProfiles", () => {
  const aggregates = [
    aggregate("1", { low: 8, high: 4 }), // strong everywhere
    aggregate("2", { low: 2, high: 1 }), // weak everywhere
    aggregate("3", { low: 5, high: 2.5 }), // dead average
  ];

  it("marks scouted teams with weighted points and flags edges", () => {
    const profiles = buildTeamProfiles(SECTIONS, aggregates, { high: 2 }, []);
    const strong = profiles.get(1)!;
    expect(strong.source).toBe("scouted");
    expect(strong.points).toBe(8 + 4 * 2);
    expect(strong.strengths.map((e) => e.fieldId).sort()).toEqual(["high", "low"]);
    expect(strong.weaknesses).toEqual([]);

    const weak = profiles.get(2)!;
    expect(weak.weaknesses.length).toBeGreaterThan(0);
    expect(weak.strengths).toEqual([]);

    const mid = profiles.get(3)!;
    expect(mid.strengths).toEqual([]);
    expect(mid.weaknesses).toEqual([]);
  });

  it("falls back to EPA for unscouted teams, none when EPA is missing", () => {
    const profiles = buildTeamProfiles(SECTIONS, aggregates, {}, [
      eventTeam(1, 99), // scouted — EPA must not override
      eventTeam(7, 31.5),
      eventTeam(8, null),
    ]);
    expect(profiles.get(1)!.source).toBe("scouted");
    expect(profiles.get(7)).toMatchObject({ points: 31.5, source: "epa", matches: 0 });
    expect(profiles.get(8)).toMatchObject({ points: null, source: "none" });
  });

  it("skips aggregates whose team id is not numeric", () => {
    const profiles = buildTeamProfiles(
      SECTIONS,
      [aggregate("frc1", { low: 1 })],
      {},
      [],
    );
    expect(profiles.size).toBe(0);
  });
});

describe("predictAlliance / predictMatch", () => {
  const profiles = buildTeamProfiles(
    SECTIONS,
    [aggregate("1", { low: 10, high: 0 }), aggregate("2", { low: 20, high: 0 })],
    {},
    [eventTeam(4, 25), eventTeam(5, null)],
  );

  it("sums known teams and reports unknown ones", () => {
    const p = predictAlliance([1, 2, 3], profiles);
    expect(p.points).toBe(30);
    expect(p.unknownTeams).toEqual([3]);
  });

  it("is null when nothing is known", () => {
    expect(predictAlliance([8, 9], profiles)).toEqual({
      points: null,
      unknownTeams: [8, 9],
    });
  });

  it("mixes scouted and EPA sources in one alliance", () => {
    expect(predictAlliance([1, 4], profiles).points).toBe(35);
  });

  it("predictMatch only computes a probability with both sides known", () => {
    const withBoth = predictMatch(match({ red: [1], blue: [4] }), profiles);
    expect(withBoth.redWinProbability).not.toBeNull();
    expect(withBoth.redWinProbability!).toBeLessThan(0.5); // 10 vs 25

    const oneSided = predictMatch(match({ red: [1], blue: [9] }), profiles);
    expect(oneSided.redWinProbability).toBeNull();
  });
});

describe("redWinProbability", () => {
  it("is symmetric around 0.5", () => {
    expect(redWinProbability(50, 50)).toBeCloseTo(0.5);
    expect(redWinProbability(60, 50) + redWinProbability(50, 60)).toBeCloseTo(1);
  });

  it("grows with the point edge", () => {
    expect(redWinProbability(60, 50)).toBeGreaterThan(0.5);
    expect(redWinProbability(80, 50)).toBeGreaterThan(redWinProbability(60, 50));
  });
});

describe("upcomingTeamMatches", () => {
  it("keeps only unplayed matches including the team, in order", () => {
    const matches = [
      match({ key: "qm1", matchNumber: 1, red: [1, 2, 3], redScore: 50, blueScore: 40 }),
      match({ key: "qm2", matchNumber: 2, red: [1, 7, 8] }),
      match({ key: "qm3", matchNumber: 3, red: [9, 7, 8], blue: [4, 5, 6] }),
      match({ key: "qm4", matchNumber: 4, blue: [1, 5, 6], red: [9, 7, 8] }),
    ];
    expect(upcomingTeamMatches(matches, 1).map((m) => m.key)).toEqual([
      "qm2",
      "qm4",
    ]);
  });
});
