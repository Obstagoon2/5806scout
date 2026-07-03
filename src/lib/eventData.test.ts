import { describe, expect, it } from "vitest";
import {
  mapMatches,
  mapTeams,
  teamKeyToNumber,
  type StatboticsTeamEvent,
  type TbaMatchSimple,
  type TbaTeamSimple,
} from "./eventData";

const tbaTeams: TbaTeamSimple[] = [
  { team_number: 5806, nickname: "Basement Lions", city: "Livingston" },
  { team_number: 254, nickname: "The Cheesy Poofs", city: "San Jose" },
  { team_number: 9999, nickname: null, city: null },
];

const statbotics: StatboticsTeamEvent[] = [
  { team: 254, epa: { total_points: { mean: 92.4 } } },
  { team: 5806, epa: { total_points: { mean: 41.7 } } },
  { team: 1111, epa: null },
];

function tbaMatch(overrides: Partial<TbaMatchSimple>): TbaMatchSimple {
  return {
    key: "2026test_qm1",
    comp_level: "qm",
    match_number: 1,
    alliances: {
      red: { team_keys: ["frc254", "frc5806", "frc9999"], score: -1 },
      blue: { team_keys: ["frc1", "frc2", "frc3"], score: -1 },
    },
    winning_alliance: "",
    time: null,
    predicted_time: null,
    ...overrides,
  };
}

describe("teamKeyToNumber", () => {
  it("strips the frc prefix", () => {
    expect(teamKeyToNumber("frc5806")).toBe(5806);
  });
});

describe("mapTeams", () => {
  it("merges EPA by team number and sorts by team number", () => {
    const teams = mapTeams(tbaTeams, statbotics);
    expect(teams.map((t) => t.teamNumber)).toEqual([254, 5806, 9999]);
    expect(teams[0].epa).toBeCloseTo(92.4);
    expect(teams[0].epaRank).toBe(1);
    expect(teams[1].epaRank).toBe(2);
  });

  it("leaves epa null for teams Statbotics doesn't know", () => {
    const teams = mapTeams(tbaTeams, statbotics);
    const unknown = teams.find((t) => t.teamNumber === 9999);
    expect(unknown?.epa).toBeNull();
    expect(unknown?.epaRank).toBeNull();
    expect(unknown?.nickname).toBe("9999");
  });
});

describe("mapMatches", () => {
  it("treats score -1 as unplayed", () => {
    const [match] = mapMatches([tbaMatch({})]);
    expect(match.redScore).toBeNull();
    expect(match.winner).toBeNull();
  });

  it("records winner and scores for played matches", () => {
    const [match] = mapMatches([
      tbaMatch({
        alliances: {
          red: { team_keys: ["frc254", "frc5806", "frc9999"], score: 87 },
          blue: { team_keys: ["frc1", "frc2", "frc3"], score: 42 },
        },
        winning_alliance: "red",
      }),
    ]);
    expect(match.redScore).toBe(87);
    expect(match.blueScore).toBe(42);
    expect(match.winner).toBe("red");
    expect(match.red).toEqual([254, 5806, 9999]);
  });

  it("marks played equal scores as a tie", () => {
    const [match] = mapMatches([
      tbaMatch({
        alliances: {
          red: { team_keys: ["frc254"], score: 50 },
          blue: { team_keys: ["frc1"], score: 50 },
        },
        winning_alliance: "",
      }),
    ]);
    expect(match.winner).toBe("tie");
  });

  it("sorts quals before playoffs, then by match number", () => {
    const matches = mapMatches([
      tbaMatch({ key: "f1", comp_level: "f", match_number: 1 }),
      tbaMatch({ key: "qm2", comp_level: "qm", match_number: 2 }),
      tbaMatch({ key: "qm1", comp_level: "qm", match_number: 1 }),
      tbaMatch({ key: "sf1", comp_level: "sf", match_number: 1 }),
    ]);
    expect(matches.map((m) => m.key)).toEqual(["qm1", "qm2", "sf1", "f1"]);
  });
});
