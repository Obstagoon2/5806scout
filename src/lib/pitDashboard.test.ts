import { describe, expect, it } from "vitest";
import type { EventMatch } from "./eventData";
import {
  currentMatch,
  formatCountdown,
  lastPlayedMatch,
  matchLabel,
  msUntilMatch,
  nextTeamMatch,
} from "./pitDashboard";

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

const played = (n: number, teams: number[] = [1, 2, 3]): EventMatch =>
  match({ matchNumber: n, red: teams, redScore: 50, blueScore: 40, winner: "red" });

describe("currentMatch / lastPlayedMatch", () => {
  it("returns the first unplayed match and the last played one", () => {
    const matches = [played(1), played(2), match({ matchNumber: 3 }), match({ matchNumber: 4 })];
    expect(currentMatch(matches)?.matchNumber).toBe(3);
    expect(lastPlayedMatch(matches)?.matchNumber).toBe(2);
  });

  it("handles an all-played and an empty schedule", () => {
    expect(currentMatch([played(1)])).toBeNull();
    expect(lastPlayedMatch([])).toBeNull();
    expect(currentMatch([])).toBeNull();
  });
});

describe("nextTeamMatch", () => {
  it("skips played matches and other teams' matches", () => {
    const matches = [
      played(1, [5806, 2, 3]),
      match({ matchNumber: 2 }),
      match({ matchNumber: 3, blue: [5806, 5, 6] }),
    ];
    expect(nextTeamMatch(matches, 5806)?.matchNumber).toBe(3);
    expect(nextTeamMatch(matches, 9999)).toBeNull();
  });
});

describe("msUntilMatch", () => {
  it("computes milliseconds until the scheduled start", () => {
    const m = match({ scheduledTime: 1_000 });
    expect(msUntilMatch(m, 700_000)).toBe(300_000);
    expect(msUntilMatch(match({ scheduledTime: null }), 0)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("formats m:ss, h:mm:ss, and clamps negatives to 0:00", () => {
    expect(formatCountdown(299_000)).toBe("4:59");
    expect(formatCountdown(3_661_000)).toBe("1:01:01");
    expect(formatCountdown(-5_000)).toBe("0:00");
  });
});

describe("matchLabel", () => {
  it("maps comp levels to short labels", () => {
    expect(matchLabel(match({ matchNumber: 12 }))).toBe("Q12");
    expect(matchLabel(match({ compLevel: "f", matchNumber: 2 }))).toBe("F2");
  });
});
