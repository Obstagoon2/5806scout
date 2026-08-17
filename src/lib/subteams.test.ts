import { describe, expect, it } from "vitest";
import {
  clampMatchesPerSitting,
  DEFAULT_MATCHES_PER_SITTING,
  eligibleUids,
  membersBySubteam,
  resolveMemberships,
  shiftGroupsFor,
  shiftPlan,
  type Subteam,
} from "@/lib/subteams";

const ALPHA: Subteam = { id: "a", name: "Alpha", duty: "match" };
const BRAVO: Subteam = { id: "b", name: "Bravo", duty: "match" };
const PITS: Subteam = { id: "p", name: "Pit crew", duty: "pit" };
const BOTH: Subteam = { id: "x", name: "Floaters", duty: "both" };

describe("clampMatchesPerSitting", () => {
  it("keeps a sane value, floors fractions, and bounds the extremes", () => {
    expect(clampMatchesPerSitting(12)).toBe(12);
    expect(clampMatchesPerSitting(7.9)).toBe(7);
    expect(clampMatchesPerSitting(0)).toBe(1);
    expect(clampMatchesPerSitting(-5)).toBe(1);
    expect(clampMatchesPerSitting(10_000)).toBe(200);
  });

  it("falls back to the default for a non-number", () => {
    expect(clampMatchesPerSitting(Number.NaN)).toBe(DEFAULT_MATCHES_PER_SITTING);
  });
});

describe("resolveMemberships", () => {
  it("keeps explicit placements", () => {
    expect(
      resolveMemberships([ALPHA, BRAVO], { u1: "b", u2: "a" }, ["u1", "u2"]),
    ).toEqual({ u1: "b", u2: "a" });
  });

  it("auto-places new scouts into the smallest subteam", () => {
    const resolved = resolveMemberships(
      [ALPHA, BRAVO],
      { u1: "a", u2: "a" },
      ["u1", "u2", "u3", "u4"],
    );

    // Alpha already has two; both newcomers balance Bravo out.
    expect(resolved).toEqual({ u1: "a", u2: "a", u3: "b", u4: "b" });
  });

  it("re-places a scout whose subteam was deleted", () => {
    expect(resolveMemberships([ALPHA], { u1: "gone" }, ["u1"])).toEqual({
      u1: "a",
    });
  });

  it("is deterministic regardless of roster order", () => {
    const forward = resolveMemberships([ALPHA, BRAVO], {}, ["u1", "u2", "u3"]);
    const reversed = resolveMemberships([ALPHA, BRAVO], {}, ["u3", "u2", "u1"]);

    expect(forward).toEqual(reversed);
  });

  it("places nobody when there are no subteams", () => {
    expect(resolveMemberships([], { u1: "a" }, ["u1"])).toEqual({});
  });
});

describe("membersBySubteam", () => {
  it("groups uids under their subteam, keeping empty groups visible", () => {
    const resolved = { u1: "a", u2: "a" };

    expect(membersBySubteam([ALPHA, BRAVO], resolved, ["u1", "u2"])).toEqual({
      a: ["u1", "u2"],
      b: [],
    });
  });
});

describe("shiftGroupsFor", () => {
  const subteams = [ALPHA, PITS, BOTH];
  const resolved = { u1: "a", u2: "p", u3: "x" };
  const uids = ["u1", "u2", "u3"];

  it("includes only subteams eligible for the duty", () => {
    expect(shiftGroupsFor("match", subteams, resolved, uids).map((g) => g.id)).toEqual([
      "a",
      "x",
    ]);
    expect(shiftGroupsFor("pit", subteams, resolved, uids).map((g) => g.id)).toEqual([
      "p",
      "x",
    ]);
  });

  it("drops eligible subteams with no members", () => {
    expect(
      shiftGroupsFor("match", [ALPHA, BRAVO], { u1: "a" }, ["u1"]).map((g) => g.id),
    ).toEqual(["a"]);
  });

  it("pools every eligible uid", () => {
    expect(eligibleUids("match", subteams, resolved, uids)).toEqual(["u1", "u3"]);
  });
});

describe("shiftPlan", () => {
  it("hands consecutive blocks to each group in turn, then wraps", () => {
    expect(shiftPlan(10, 2, 3)).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0, 1]);
  });

  it("puts everything on one group when there's only one", () => {
    expect(shiftPlan(5, 1, 2)).toEqual([0, 0, 0, 0, 0]);
  });

  it("clamps a nonsense sitting length rather than dividing by zero", () => {
    expect(shiftPlan(4, 2, 0)).toEqual([0, 1, 0, 1]);
  });

  it("returns nothing when there are no groups or no matches", () => {
    expect(shiftPlan(10, 0, 5)).toEqual([]);
    expect(shiftPlan(0, 2, 5)).toEqual([]);
  });
});
