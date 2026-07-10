import { describe, expect, it } from "vitest";
import {
  canonicalDataTeamId,
  generateInviteCode,
  INVITE_CODE_LENGTH,
  INVITE_TTL_MS,
  inviteRedemptionError,
  normalizeInviteCode,
  type SisterInviteDoc,
} from "./sisterTeam";

describe("generateInviteCode", () => {
  it("produces codes of the expected length from the safe alphabet", () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(INVITE_CODE_LENGTH);
    // No lookalike characters (0/O/1/I/L) — codes are read out loud.
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/);
  });

  it("is deterministic for a seeded rng", () => {
    const seeded = () => {
      let n = 0;
      return () => ((n += 7) % 31) / 31;
    };
    expect(generateInviteCode(seeded())).toBe(generateInviteCode(seeded()));
  });
});

describe("normalizeInviteCode", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeInviteCode("ab2c-d3ef")).toBe("AB2CD3EF");
    expect(normalizeInviteCode("  ab2c d3ef ")).toBe("AB2CD3EF");
  });
});

describe("canonicalDataTeamId", () => {
  it("returns own team when unlinked", () => {
    expect(canonicalDataTeamId("5806")).toBe("5806");
    expect(canonicalDataTeamId("5806", null)).toBe("5806");
    expect(canonicalDataTeamId("5806", "5806")).toBe("5806");
  });

  it("picks the numerically lower team number from either side", () => {
    expect(canonicalDataTeamId("5806", "254")).toBe("254");
    expect(canonicalDataTeamId("254", "5806")).toBe("254");
    // Numeric, not lexicographic: 999 < 5806 even though "999" > "5806".
    expect(canonicalDataTeamId("5806", "999")).toBe("999");
  });

  it("falls back to lexicographic for non-numeric ids", () => {
    expect(canonicalDataTeamId("beta", "alpha")).toBe("alpha");
    expect(canonicalDataTeamId("alpha", "beta")).toBe("alpha");
  });
});

describe("inviteRedemptionError", () => {
  const invite: SisterInviteDoc = {
    fromTeamId: "254",
    fromTeamNumber: "254",
    fromTeamName: "The Cheesy Poofs",
    createdByUid: "admin-a",
    createdAt: 1_000,
    expiresAt: 1_000 + INVITE_TTL_MS,
  };
  const base = {
    invite,
    now: 2_000,
    myTeamId: "5806",
    mySisterTeamId: null,
    fromTeamSisterId: null,
  };

  it("passes a fresh code between two unlinked teams", () => {
    expect(inviteRedemptionError(base)).toBeNull();
  });

  it("rejects a missing (used or never issued) code", () => {
    expect(inviteRedemptionError({ ...base, invite: null })).toMatch(/doesn't exist/);
  });

  it("rejects an expired code", () => {
    expect(
      inviteRedemptionError({ ...base, now: invite.expiresAt + 1 }),
    ).toMatch(/expired/);
  });

  it("rejects redeeming your own team's code", () => {
    expect(inviteRedemptionError({ ...base, myTeamId: "254" })).toMatch(/your own team/);
  });

  it("rejects when either side is already linked", () => {
    expect(inviteRedemptionError({ ...base, mySisterTeamId: "111" })).toMatch(
      /already linked/,
    );
    expect(inviteRedemptionError({ ...base, fromTeamSisterId: "111" })).toMatch(
      /already linked/,
    );
  });
});
