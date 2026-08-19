import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Firestore stand-in, same shape as sisterTeamOps.test.ts: paths are
// joined path segments so doc()/collection() calls for the same location
// resolve to the same record.
const store = new Map<string, Record<string, unknown>>();

function pathOf(args: unknown[]): string {
  // First arg is always the `db` stand-in; drop it.
  return args.slice(1).join("/");
}

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => ({ __path: pathOf(args) }),
  collection: (...args: unknown[]) => ({ __path: pathOf(args) }),
  getDocs: async (ref: { __path: string }) => {
    const prefix = `${ref.__path}/`;
    const docs = [...store.entries()]
      .filter(
        ([key]) =>
          key.startsWith(prefix) && !key.slice(prefix.length).includes("/"),
      )
      .map(([key, data]) => ({ id: key.slice(prefix.length), data: () => data }));
    return { docs };
  },
  writeBatch: () => {
    const ops: Array<() => void> = [];
    return {
      delete: (ref: { __path: string }) => {
        ops.push(() => store.delete(ref.__path));
      },
      commit: async () => {
        for (const op of ops) op();
      },
    };
  },
}));

const { isEmptyReset, resetScoutingData } = await import("./resetDataOps");

/** A store holding one of everything a reset is supposed to care about. */
function seed(teamId = "team-1"): void {
  store.set(`teams/${teamId}/pitScouting/5806`, { scoutName: "Ada" });
  store.set(`teams/${teamId}/pitScouting/254`, { scoutName: "Ada" });
  store.set(`teams/${teamId}/pitScoutingMedia/5806`, { values: {} });
  store.set(`teams/${teamId}/matchScouting/m1`, { matchNumber: 1 });
  store.set(`teams/${teamId}/matchScouting/m2`, { matchNumber: 2 });
  store.set(`teams/${teamId}/matchScouting/m3`, { matchNumber: 3 });
  store.set(`teams/${teamId}/talkie/t1`, { title: "Need a battery" });
  store.set(`teams/${teamId}/config/pitAssignments`, { byScout: {} });
  store.set(`teams/${teamId}/config/matchAssignments`, { completedSlots: [] });
  store.set(`teams/${teamId}/config/pitTodo`, { done: ["5806"] });
  store.set(`teams/${teamId}/config/reliabilityFlags`, { teams: {} });
}

/** Config the team set up rather than collected — none of it may be touched. */
function seedSetup(teamId = "team-1"): void {
  store.set(`teams/${teamId}/config/event`, { eventKey: "2026cc" });
  store.set(`teams/${teamId}/config/picklist`, { ranked: ["5806"] });
  store.set(`teams/${teamId}/config/pitMap`, { areas: [] });
  store.set(`teams/${teamId}/config/scoutDuties`, { duties: {} });
  store.set(`teams/${teamId}/config/matchForm`, { customFields: [] });
}

describe("resetScoutingData", () => {
  beforeEach(() => {
    store.clear();
  });

  it("deletes every submission, assignment, and talkie request", async () => {
    seed();

    const counts = await resetScoutingData(["team-1"]);

    expect(counts).toEqual({
      pitScouting: 2,
      pitScoutingMedia: 1,
      matchScouting: 3,
      talkie: 1,
      config: 4,
    });
    expect(store.size).toBe(0);
  });

  it("leaves the team's own setup alone", async () => {
    seed();
    seedSetup();

    await resetScoutingData(["team-1"]);

    expect([...store.keys()].sort()).toEqual([
      "teams/team-1/config/event",
      "teams/team-1/config/matchForm",
      "teams/team-1/config/picklist",
      "teams/team-1/config/pitMap",
      "teams/team-1/config/scoutDuties",
    ]);
  });

  it("never reaches into a store it wasn't given", async () => {
    seed("team-1");
    seed("team-2");

    await resetScoutingData(["team-1"]);

    expect([...store.keys()].every((key) => key.startsWith("teams/team-2/"))).toBe(
      true,
    );
    expect(store.size).toBe(11);
  });

  it("clears a sister pair's own stores as well as the shared one", async () => {
    // Linking copies into the canonical store but leaves each side's pre-link
    // docs where they were, so all three have to go or unlinking resurrects
    // the season.
    seed("team-1");
    seed("team-2");
    seedSetup("team-2");

    const counts = await resetScoutingData(["team-1", "team-2"]);

    expect(counts.matchScouting).toBe(6);
    expect(counts.config).toBe(8);
    expect([...store.keys()].sort()).toEqual([
      "teams/team-2/config/event",
      "teams/team-2/config/matchForm",
      "teams/team-2/config/picklist",
      "teams/team-2/config/pitMap",
      "teams/team-2/config/scoutDuties",
    ]);
  });

  it("visits a repeated store id only once", async () => {
    seed("team-1");

    const counts = await resetScoutingData(["team-1", "team-1"]);

    expect(counts.matchScouting).toBe(3);
    expect(store.size).toBe(0);
  });

  it("reports zeros on an already-empty store", async () => {
    const counts = await resetScoutingData(["team-1"]);

    expect(isEmptyReset(counts)).toBe(true);
    expect(counts.matchScouting).toBe(0);
  });

  it("splits a collection larger than one write batch", async () => {
    // 450 ops per batch, so 1000 match rows must survive the chunking rather
    // than silently stopping at the cap.
    for (let i = 0; i < 1000; i++) {
      store.set(`teams/team-1/matchScouting/m${i}`, { matchNumber: i });
    }

    const counts = await resetScoutingData(["team-1"]);

    expect(counts.matchScouting).toBe(1000);
    expect(store.size).toBe(0);
  });

  it("counts a reset as non-empty when anything at all was removed", () => {
    expect(
      isEmptyReset({
        pitScouting: 0,
        pitScoutingMedia: 0,
        matchScouting: 0,
        talkie: 1,
        config: 0,
      }),
    ).toBe(false);
  });
});
