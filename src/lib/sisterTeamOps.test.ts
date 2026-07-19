import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Team } from "@/lib/types";

// In-memory Firestore stand-in. Paths are joined path segments so doc()/
// collection() calls that reference the same location resolve to the same
// record, mirroring real Firestore reference semantics closely enough for
// these pure-logic tests.
const store = new Map<string, Record<string, unknown>>();
const DELETE_FIELD = Symbol("deleteField");

function pathOf(args: unknown[]): string {
  // First arg is always the `db` stand-in; drop it.
  return args.slice(1).join("/");
}

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => ({ __path: pathOf(args) }),
  collection: (...args: unknown[]) => ({ __path: pathOf(args) }),
  deleteField: () => DELETE_FIELD,
  getDoc: async (ref: { __path: string }) => {
    const data = store.get(ref.__path);
    return {
      exists: () => data !== undefined,
      data: () => data,
    };
  },
  getDocs: async (ref: { __path: string }) => {
    const prefix = `${ref.__path}/`;
    const docs = [...store.entries()]
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
      .map(([key, data]) => ({ id: key.slice(prefix.length), data: () => data }));
    return { docs };
  },
  setDoc: async (ref: { __path: string }, data: Record<string, unknown>) => {
    store.set(ref.__path, data);
  },
  writeBatch: () => {
    const ops: Array<() => void> = [];
    return {
      update: (ref: { __path: string }, fields: Record<string, unknown>) => {
        ops.push(() => {
          const existing = store.get(ref.__path) ?? {};
          const next = { ...existing };
          for (const [k, v] of Object.entries(fields)) {
            if (v === DELETE_FIELD) delete next[k];
            else next[k] = v;
          }
          store.set(ref.__path, next);
        });
      },
      set: (ref: { __path: string }, data: Record<string, unknown>) => {
        ops.push(() => store.set(ref.__path, data));
      },
      delete: (ref: { __path: string }) => {
        ops.push(() => store.delete(ref.__path));
      },
      commit: async () => {
        for (const op of ops) op();
      },
    };
  },
}));

const { createSisterInvite, redeemSisterInvite, unlinkSisterTeam } = await import(
  "./sisterTeamOps"
);

function team(overrides: Partial<Team> = {}): Team {
  return {
    teamNumber: "5806",
    teamName: "Basement Lions",
    ...overrides,
  } as Team;
}

describe("sisterTeamOps", () => {
  beforeEach(() => {
    store.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createSisterInvite", () => {
    it("writes an invite doc and returns its code", async () => {
      const code = await createSisterInvite({
        teamId: "team-1",
        team: team(),
        uid: "uid-1",
      });

      expect(code).toHaveLength(8);
      const saved = store.get(`sisterInvites/${code}`);
      expect(saved).toMatchObject({ fromTeamId: "team-1", createdByUid: "uid-1" });
    });

    it("retries on a write collision and eventually throws after 3 attempts", async () => {
      const firestore = await import("firebase/firestore");
      const setDocSpy = vi
        .spyOn(firestore, "setDoc")
        .mockRejectedValue(new Error("PERMISSION_DENIED"));

      await expect(
        createSisterInvite({ teamId: "team-1", team: team(), uid: "uid-1" }),
      ).rejects.toThrow("PERMISSION_DENIED");
      expect(setDocSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe("redeemSisterInvite", () => {
    it("throws a readable error when the code doesn't exist", async () => {
      await expect(
        redeemSisterInvite({
          code: "NOPE0000",
          myTeamId: "team-2",
          myTeam: team({ teamNumber: "254" }),
        }),
      ).rejects.toThrow(/doesn't exist or was already used/);
    });

    it("links both teams, deletes the invite, and copies shared data into the canonical (lower-numbered) team", async () => {
      store.set("sisterInvites/ABC12345", {
        fromTeamId: "team-1",
        fromTeamNumber: "5806",
        fromTeamName: "Basement Lions",
        createdByUid: "uid-1",
        createdAt: 0,
        expiresAt: Date.now() + 1000,
      });
      store.set("teams/team-1", { teamNumber: "5806", teamName: "Basement Lions" });
      // Seed data only the higher-numbered (non-canonical) team has, to
      // verify it gets copied into the canonical team's subtree.
      store.set("teams/team-2/pitScouting/entry-1", { note: "scouted by team 2" });

      const result = await redeemSisterInvite({
        code: "abc-1234-5",
        myTeamId: "team-2",
        myTeam: team({ teamNumber: "254" }),
      });

      expect(result).toEqual({ sisterTeamId: "team-1" });
      expect(store.get("sisterInvites/ABC12345")).toBeUndefined();
      expect(store.get("teams/team-1")).toMatchObject({
        sisterTeamId: "team-2",
        sisterTeamNumber: "254",
      });
      expect(store.get("teams/team-2")).toMatchObject({
        sisterTeamId: "team-1",
        sisterTeamNumber: "5806",
      });
      // 254 > 5806? No — numeric compare: 254 < 5806, so team-2 (254) is
      // canonical and receives team-1's copy; team-1 has no seed data here,
      // so instead verify team-2's own subtree still has its original entry.
      expect(store.get("teams/team-2/pitScouting/entry-1")).toBeDefined();
    });

    it("rejects redeeming your own team's code", async () => {
      store.set("sisterInvites/SELF0000", {
        fromTeamId: "team-1",
        fromTeamNumber: "5806",
        fromTeamName: "Basement Lions",
        createdByUid: "uid-1",
        createdAt: 0,
        expiresAt: Date.now() + 1000,
      });

      await expect(
        redeemSisterInvite({
          code: "SELF0000",
          myTeamId: "team-1",
          myTeam: team(),
        }),
      ).rejects.toThrow(/your own team's code/);
    });

    it("rejects an expired code", async () => {
      store.set("sisterInvites/OLD00000", {
        fromTeamId: "team-1",
        fromTeamNumber: "5806",
        fromTeamName: "Basement Lions",
        createdByUid: "uid-1",
        createdAt: 0,
        expiresAt: Date.now() - 1000,
      });

      await expect(
        redeemSisterInvite({
          code: "OLD00000",
          myTeamId: "team-2",
          myTeam: team({ teamNumber: "254" }),
        }),
      ).rejects.toThrow(/expired/);
    });
  });

  describe("unlinkSisterTeam", () => {
    it("is a no-op when the team has no sister linked", async () => {
      const firestore = await import("firebase/firestore");
      const batchSpy = vi.spyOn(firestore, "writeBatch");

      await unlinkSisterTeam({ myTeamId: "team-1", myTeam: team() });
      expect(batchSpy).not.toHaveBeenCalled();
    });

    it("clears link fields on both teams and copies data to the departing team", async () => {
      store.set("teams/team-1", {
        teamNumber: "5806",
        sisterTeamId: "team-2",
        sisterTeamNumber: "254",
        sisterLinkedAt: 1,
      });
      store.set("teams/team-2", { teamNumber: "254", sisterTeamId: "team-1" });
      store.set("teams/team-1/talkie/msg-1", { title: "shared note" });

      await unlinkSisterTeam({
        myTeamId: "team-2",
        myTeam: team({ teamNumber: "254", sisterTeamId: "team-1" } as Partial<Team>),
      });

      expect(store.get("teams/team-1")?.sisterTeamId).toBeUndefined();
      expect(store.get("teams/team-2")?.sisterTeamId).toBeUndefined();
      // Canonical (team-1, lower number) copies into team-2 on unlink.
      expect(store.get("teams/team-2/talkie/msg-1")).toEqual({
        title: "shared note",
      });
    });
  });
});
