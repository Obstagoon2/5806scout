import { describe, expect, it } from "vitest";
import {
  eventSearchYear,
  mapMatches,
  mapRankings,
  mapTeams,
  mapVenue,
  preserveEpa,
  searchEvents,
  teamKeyToNumber,
  type EventTeam,
  type StatboticsTeamEvent,
  type TbaEventSimple,
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

  it("reads epa when total_points is a plain number (current API shape)", () => {
    const teams = mapTeams(tbaTeams, [
      { team: 254, epa: { total_points: 88.1 } },
    ]);
    expect(teams.find((t) => t.teamNumber === 254)?.epa).toBeCloseTo(88.1);
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

describe("mapVenue", () => {
  it("maps TBA event location fields, preserving nulls", () => {
    expect(
      mapVenue({
        name: "FMA District Montgomery Event",
        location_name: "Montgomery Township High School",
        address: "1016 Route 601",
        city: "Skillman",
        gmaps_url: null,
        lat: null,
        lng: null,
      }),
    ).toEqual({
      name: "Montgomery Township High School",
      address: "1016 Route 601",
      city: "Skillman",
      gmapsUrl: null,
      lat: null,
      lng: null,
    });
  });
});

describe("mapRankings", () => {
  function entry(
    team: number,
    rank: number | null,
    epa: number | null,
  ): StatboticsTeamEvent {
    return {
      team,
      team_name: `Team ${team}`,
      epa: epa !== null ? { total_points: epa } : null,
      record:
        rank !== null
          ? {
              qual: {
                wins: 5,
                losses: 3,
                ties: 0,
                rps_per_match: 2.5,
                rank,
              },
            }
          : null,
    };
  }

  it("sorts by qual rank ascending", () => {
    const rows = mapRankings([entry(111, 3, 20), entry(222, 1, 50), entry(333, 2, 40)]);
    expect(rows.map((r) => r.teamNumber)).toEqual([222, 333, 111]);
    expect(rows[0]).toMatchObject({
      rank: 1,
      teamName: "Team 222",
      wins: 5,
      losses: 3,
      ties: 0,
      rpsPerMatch: 2.5,
      epa: 50,
    });
  });

  it("puts unranked teams last, ordered by EPA best-first", () => {
    const rows = mapRankings([
      entry(111, null, 30),
      entry(222, 1, 50),
      entry(333, null, 60),
    ]);
    expect(rows.map((r) => r.teamNumber)).toEqual([222, 333, 111]);
    expect(rows[1].rank).toBeNull();
  });
});

describe("eventSearchYear", () => {
  it("uses an explicit 4-digit year in the query", () => {
    expect(eventSearchYear("2025 hopper", 2026)).toBe(2025);
    expect(eventSearchYear("mount olive 2024", 2026)).toBe(2024);
  });

  it("falls back to the current season", () => {
    expect(eventSearchYear("hopper", 2026)).toBe(2026);
    expect(eventSearchYear("team 254", 2026)).toBe(2026);
  });
});

describe("searchEvents", () => {
  const events: TbaEventSimple[] = [
    {
      key: "2026njski",
      name: "FMA District Seneca Event",
      city: "Tabernacle",
      state_prov: "NJ",
      country: "USA",
      start_date: "2026-03-06",
      end_date: "2026-03-08",
    },
    {
      key: "2026njfla",
      name: "FMA District Mount Olive Event",
      city: "Flanders",
      state_prov: "NJ",
      country: "USA",
      start_date: "2026-03-13",
      end_date: "2026-03-15",
    },
    {
      key: "2026casj",
      name: "Silicon Valley Regional",
      city: "San Jose",
      state_prov: "CA",
      country: "USA",
      start_date: "2026-04-01",
      end_date: "2026-04-04",
    },
  ];

  it("matches by name tokens across fields", () => {
    const results = searchEvents(events, "mount olive");
    expect(results.map((r) => r.key)).toEqual(["2026njfla"]);
    expect(results[0]).toMatchObject({
      name: "FMA District Mount Olive Event",
      location: "Flanders, NJ",
      startDate: "2026-03-13",
    });
  });

  it("matches by event key and ranks exact keys first", () => {
    expect(searchEvents(events, "2026njski")[0].key).toBe("2026njski");
    expect(searchEvents(events, "njski")[0].key).toBe("2026njski");
  });

  it("matches by city/state and returns empty for no hits", () => {
    expect(searchEvents(events, "san jose").map((r) => r.key)).toEqual([
      "2026casj",
    ]);
    expect(searchEvents(events, "einstein")).toEqual([]);
    expect(searchEvents(events, "   ")).toEqual([]);
  });

  it("caps results at the limit", () => {
    expect(searchEvents(events, "2026", 2)).toHaveLength(2);
  });
});

describe("preserveEpa", () => {
  const previous: EventTeam[] = [
    { teamNumber: 5806, nickname: "Basement Lions", city: "Livingston", epa: 41.7, epaRank: 2 },
    { teamNumber: 254, nickname: "The Cheesy Poofs", city: "San Jose", epa: 92.4, epaRank: 1 },
  ];

  function fresh(epa: number | null, teamNumber = 5806): EventTeam[] {
    return [
      { teamNumber, nickname: "Basement Lions", city: "Livingston", epa, epaRank: epa === null ? null : 3 },
    ];
  }

  it("carries prior EPA and rank forward when the fresh EPA is null", () => {
    const merged = preserveEpa(fresh(null), previous);
    expect(merged[0]).toMatchObject({ epa: 41.7, epaRank: 2 });
  });

  it("keeps a fresh non-null EPA over the prior value", () => {
    const merged = preserveEpa(fresh(50.1), previous);
    expect(merged[0]).toMatchObject({ epa: 50.1, epaRank: 3 });
  });

  it("leaves EPA null for a team absent from the previous sync", () => {
    const merged = preserveEpa(fresh(null, 1234), previous);
    expect(merged[0].epa).toBeNull();
    expect(merged[0].epaRank).toBeNull();
  });

  it("leaves EPA null when the previous sync also had none", () => {
    const merged = preserveEpa(fresh(null), [
      { teamNumber: 5806, nickname: "Basement Lions", city: "Livingston", epa: null, epaRank: null },
    ]);
    expect(merged[0].epa).toBeNull();
  });

  it("preserves the fresh team roster, not the previous one", () => {
    const merged = preserveEpa(fresh(null, 1234), previous);
    expect(merged).toHaveLength(1);
    expect(merged[0].teamNumber).toBe(1234);
  });
});
