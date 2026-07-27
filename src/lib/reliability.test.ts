import { describe, expect, it } from "vitest";
import {
  isMatchFlagged,
  isTeamWideConcern,
  reliabilityTooltip,
  sanitizeReliabilityFlags,
  scoutedMatchCount,
  type TeamReliability,
} from "./reliability";

function team(overrides: Partial<TeamReliability> = {}): TeamReliability {
  return {
    flaggedMatches: [],
    scoutedMatches: [],
    flaggedByName: "Sam",
    updatedAtMs: 1,
    ...overrides,
  };
}

/** Distinct match numbers 1..n, so ratios read clearly in the tests below. */
function matches(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1);
}

describe("isTeamWideConcern", () => {
  it("is false with no flags at all", () => {
    expect(isTeamWideConcern(team({ scoutedMatches: matches(9) }))).toBe(false);
  });

  it("keeps a single flag scoped when it's under a third of the matches", () => {
    // 1 of 9 — a bad match, not a bad robot.
    expect(
      isTeamWideConcern(team({ flaggedMatches: [3], scoutedMatches: matches(9) })),
    ).toBe(false);
  });

  it("is false at exactly one third — the threshold is strictly greater", () => {
    // 3 of 9 is exactly 1/3, so it must not escalate.
    expect(
      isTeamWideConcern(
        team({ flaggedMatches: [1, 2, 3], scoutedMatches: matches(9) }),
      ),
    ).toBe(false);
  });

  it("escalates once flags pass one third", () => {
    // 4 of 9 > 1/3.
    expect(
      isTeamWideConcern(
        team({ flaggedMatches: [1, 2, 3, 4], scoutedMatches: matches(9) }),
      ),
    ).toBe(true);
  });

  it("escalates a single flag when it's the team's only scouted match", () => {
    // 1 of 1 — nothing yet says otherwise, so the warning travels.
    expect(
      isTeamWideConcern(team({ flaggedMatches: [1], scoutedMatches: [1] })),
    ).toBe(true);
  });

  it("does not escalate 1 of 4", () => {
    expect(
      isTeamWideConcern(team({ flaggedMatches: [2], scoutedMatches: matches(4) })),
    ).toBe(false);
  });

  it("escalates 2 of 5", () => {
    expect(
      isTeamWideConcern(
        team({ flaggedMatches: [1, 2], scoutedMatches: matches(5) }),
      ),
    ).toBe(true);
  });

  it("counts a flagged match even when it's missing from scoutedMatches", () => {
    // A dropped counter write must not inflate the ratio past the threshold.
    const t = team({ flaggedMatches: [10], scoutedMatches: matches(9) });
    expect(scoutedMatchCount(t)).toBe(10);
    expect(isTeamWideConcern(t)).toBe(false);
  });

  it("ignores duplicate submissions for the same match", () => {
    // arrayUnion dedupes in Firestore; the sanitizer dedupes defensively.
    const t = sanitizeReliabilityFlags({
      teams: { "5806": { flaggedMatches: [4, 4, 4], scoutedMatches: [1, 2, 3, 4, 4] } },
    })["5806"];
    expect(t.flaggedMatches).toEqual([4]);
    expect(scoutedMatchCount(t)).toBe(4);
    expect(isTeamWideConcern(t)).toBe(false);
  });
});

describe("isMatchFlagged", () => {
  const t = team({ flaggedMatches: [3, 7], scoutedMatches: matches(12) });

  it("is true only for the matches that were flagged", () => {
    expect(isMatchFlagged(t, 3)).toBe(true);
    expect(isMatchFlagged(t, 7)).toBe(true);
  });

  it("is false for unflagged matches, even though the team has flags", () => {
    expect(isMatchFlagged(t, 4)).toBe(false);
    expect(isMatchFlagged(t, 12)).toBe(false);
  });

  it("stays match-scoped while the team is below the threshold", () => {
    // 2 of 12 — the flag shows on Q3/Q7 and nowhere else.
    expect(isTeamWideConcern(t)).toBe(false);
  });
});

describe("sanitizeReliabilityFlags", () => {
  it("returns an empty map for junk input", () => {
    expect(sanitizeReliabilityFlags(null)).toEqual({});
    expect(sanitizeReliabilityFlags({})).toEqual({});
    expect(sanitizeReliabilityFlags({ teams: 7 })).toEqual({});
  });

  it("drops malformed team entries without losing the good ones", () => {
    const out = sanitizeReliabilityFlags({
      teams: { "5806": { flaggedMatches: [1], scoutedMatches: [1, 2] }, "254": null },
    });
    expect(Object.keys(out)).toEqual(["5806"]);
  });

  it("filters non-numeric match entries and sorts what's left", () => {
    const out = sanitizeReliabilityFlags({
      teams: { "5806": { flaggedMatches: [5, "x", null, 2, NaN] } },
    });
    expect(out["5806"].flaggedMatches).toEqual([2, 5]);
  });

  // Legacy docs stored only the latest flagged match and no scouted history.
  it("migrates a legacy matchNumber into flaggedMatches", () => {
    const out = sanitizeReliabilityFlags({
      teams: { "5806": { flaggedByName: "Sam", matchNumber: 12, updatedAtMs: 5 } },
    });
    expect(out["5806"].flaggedMatches).toEqual([12]);
    expect(out["5806"].flaggedByName).toBe("Sam");
  });

  it("keeps a legacy flag team-wide rather than silently hiding it", () => {
    const out = sanitizeReliabilityFlags({
      teams: { "5806": { flaggedByName: "Sam", matchNumber: 12 } },
    });
    expect(isTeamWideConcern(out["5806"])).toBe(true);
  });

  it("prefers the new arrays over a stale legacy matchNumber", () => {
    const out = sanitizeReliabilityFlags({
      teams: {
        "5806": { flaggedMatches: [1, 2], scoutedMatches: matches(9), matchNumber: 99 },
      },
    });
    expect(out["5806"].flaggedMatches).toEqual([1, 2]);
  });

  it("defaults missing metadata instead of throwing", () => {
    const out = sanitizeReliabilityFlags({ teams: { "5806": {} } });
    expect(out["5806"]).toEqual({
      flaggedMatches: [],
      scoutedMatches: [],
      flaggedByName: "",
      updatedAtMs: 0,
    });
  });
});

describe("reliabilityTooltip", () => {
  it("reads as a pattern when the concern is team-wide", () => {
    expect(
      reliabilityTooltip(
        team({ flaggedMatches: [1, 2, 3], scoutedMatches: matches(5) }),
      ),
    ).toBe("Reliability issues in 3 of 5 scouted matches by Sam");
  });

  it("names the specific matches when it's still match-scoped", () => {
    expect(
      reliabilityTooltip(
        team({ flaggedMatches: [3, 7], scoutedMatches: matches(12) }),
      ),
    ).toBe("Reliability issue flagged by Sam (Q3, Q7)");
  });

  it("omits the scout when the name is missing", () => {
    expect(
      reliabilityTooltip(
        team({ flaggedMatches: [3], scoutedMatches: matches(12), flaggedByName: "" }),
      ),
    ).toBe("Reliability issue flagged (Q3)");
  });

  it("singularizes a one-match denominator", () => {
    expect(
      reliabilityTooltip(team({ flaggedMatches: [1], scoutedMatches: [1] })),
    ).toBe("Reliability issues in 1 of 1 scouted match by Sam");
  });
});
