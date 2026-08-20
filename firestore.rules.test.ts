import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Rules tests for the sister-team link — the one place this app grants a
// signed-in user access to another team's data, and the one place a mistake
// either leaks a team's scouting or silently withholds it.
//
// The collections a linked pair pools are listed one by one in
// firestore.rules; the catch-all above them is same-team-only. That's the
// safe default, but it means a new pooled collection is easy to forget, which
// is exactly how pitScoutingMedia ended up shared in the app and not in the
// rules. This suite names every pooled collection so the next omission fails
// here instead of at an event.
//
// Needs the Firestore emulator: `npm run test:rules` starts one around it.

const PROJECT_ID = "scout-rules-test";

/** Collections a verified sister pair shares. */
const POOLED = [
  "pitScouting",
  "pitScoutingMedia",
  "matchScouting",
  "talkie",
] as const;

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seeded with rules off: these are the documents the rules themselves read
  // (via get()) to decide anything at all.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // teamA and teamB point at each other — a mutual, verified link.
    await setDoc(doc(db, "teams/teamA"), {
      teamNumber: "5806",
      sisterTeamId: "teamB",
    });
    await setDoc(doc(db, "teams/teamB"), {
      teamNumber: "9999",
      sisterTeamId: "teamA",
    });
    // teamC is unlinked, and teamD claims a link teamA never returns.
    await setDoc(doc(db, "teams/teamC"), { teamNumber: "1234" });
    await setDoc(doc(db, "teams/teamD"), {
      teamNumber: "4321",
      sisterTeamId: "teamA",
    });

    await setDoc(doc(db, "users/alice"), { teamId: "teamA", role: "admin" });
    await setDoc(doc(db, "users/bob"), { teamId: "teamB", role: "scout" });
    await setDoc(doc(db, "users/bea"), { teamId: "teamB", role: "admin" });
    await setDoc(doc(db, "users/erin"), { teamId: "teamA", role: "scout" });
    await setDoc(doc(db, "users/carol"), { teamId: "teamC", role: "admin" });
    await setDoc(doc(db, "users/dave"), { teamId: "teamD", role: "admin" });

    // teamA's scouting data, which teamB should reach and the others must not.
    for (const collection of POOLED) {
      await setDoc(doc(db, `teams/teamA/${collection}/doc1`), { seeded: true });
    }
    await setDoc(doc(db, "teams/teamA/config/scoutDuties"), { seeded: true });
    await setDoc(doc(db, "teams/teamA/config/picklist"), { seeded: true });
    // Not pooled: a pair shares what it observed, not the plan each side drew.
    await setDoc(doc(db, "teams/teamA/strategyBoards/qm1"), { seeded: true });
    // Talkie requests carry a poster, who may withdraw their own.
    await setDoc(doc(db, "teams/teamA/talkie/byErin"), { createdByUid: "erin" });
    await setDoc(doc(db, "teams/teamA/talkie/byBob"), { createdByUid: "bob" });
  });
});

const as = (uid: string) => testEnv.authenticatedContext(uid).firestore();

describe("a linked sister team", () => {
  it.each(POOLED)("reads teamA's %s", async (collection) => {
    await assertSucceeds(
      getDoc(doc(as("bob"), `teams/teamA/${collection}/doc1`)),
    );
  });

  it.each(POOLED)("writes teamA's %s", async (collection) => {
    await setDoc(doc(as("bob"), `teams/teamA/${collection}/doc2`), { x: 1 });
  });

  it("reads teamA's shared config", async () => {
    await assertSucceeds(
      getDoc(doc(as("bob"), "teams/teamA/config/scoutDuties")),
    );
  });

  it("never reads teamA's picklist — each team ranks alone", async () => {
    await assertFails(getDoc(doc(as("bob"), "teams/teamA/config/picklist")));
  });

  it("never reads teamA's strategy boards — each team plans alone", async () => {
    await assertFails(getDoc(doc(as("bob"), "teams/teamA/strategyBoards/qm1")));
  });

  it("never writes a strategy board into teamA", async () => {
    await assertFails(
      setDoc(doc(as("bob"), "teams/teamA/strategyBoards/qm2"), { x: 1 }),
    );
  });

  it("is not let in by being the sister team's admin either", async () => {
    await assertFails(getDoc(doc(as("bea"), "teams/teamA/strategyBoards/qm1")));
    await assertFails(
      deleteDoc(doc(as("bea"), "teams/teamA/strategyBoards/qm1")),
    );
  });
});

describe("a team's own strategy boards", () => {
  it("are read and written by its own members", async () => {
    await assertSucceeds(
      getDoc(doc(as("erin"), "teams/teamA/strategyBoards/qm1")),
    );
    await assertSucceeds(
      setDoc(doc(as("erin"), "teams/teamA/strategyBoards/qm3"), { x: 1 }),
    );
  });

  it("are not reachable by an unlinked team", async () => {
    await assertFails(
      getDoc(doc(as("carol"), "teams/teamA/strategyBoards/qm1")),
    );
  });
});

describe("an unlinked team", () => {
  it.each(POOLED)("cannot read teamA's %s", async (collection) => {
    await assertFails(getDoc(doc(as("carol"), `teams/teamA/${collection}/doc1`)));
  });

  it("cannot write teamA's scouting data", async () => {
    await assertFails(
      setDoc(doc(as("carol"), "teams/teamA/pitScouting/doc2"), { x: 1 }),
    );
  });
});

describe("a one-sided link", () => {
  // teamD's doc claims teamA as its sister; teamA's doc does not agree. Only
  // a mutual link may grant anything, or a team could help itself to another's
  // data by writing one field on its own doc.
  it.each(POOLED)("grants nothing on teamA's %s", async (collection) => {
    await assertFails(getDoc(doc(as("dave"), `teams/teamA/${collection}/doc1`)));
  });
});

// A team may have any number of admins, and any of them may arrive through
// signup rather than being promoted. What must stay shut is self-promotion —
// the rules are the only thing stopping a scout typing themselves a new role.
describe("who may become an admin", () => {
  it("lets a second admin sign up for a team that already has one", async () => {
    // teamC already has carol as an admin.
    await assertSucceeds(
      setDoc(doc(as("frank"), "users/frank"), {
        teamId: "teamC",
        role: "admin",
        active: true,
      }),
    );
  });

  it("still refuses a profile created for somebody else", async () => {
    await assertFails(
      setDoc(doc(as("frank"), "users/mallory"), {
        teamId: "teamC",
        role: "admin",
        active: true,
      }),
    );
  });

  it("never lets a scout promote themselves", async () => {
    await assertFails(
      setDoc(doc(as("erin"), "users/erin"), { teamId: "teamA", role: "admin" }),
    );
  });

  it("lets an admin promote a teammate", async () => {
    await assertSucceeds(
      setDoc(doc(as("alice"), "users/erin"), { teamId: "teamA", role: "admin" }),
    );
  });

  // A scout CAN write their own team doc — the recursive `match /{document=**}`
  // nested under /teams/{teamId} matches the team doc itself, not just its
  // subcollections. That is worth knowing, but it grants no authority: the
  // role that gates everything lives on users/{uid}, which the same scout
  // cannot touch. This test pins that separation down.
  it("gains a scout nothing — the role lives on users/{uid}, not the team doc", async () => {
    await assertSucceeds(
      setDoc(doc(as("erin"), "teams/teamA"), {
        teamNumber: "5806",
        selfDeclaredAdmin: true,
      }),
    );
    await assertFails(
      deleteDoc(doc(as("erin"), "teams/teamA/pitScouting/doc1")),
    );
  });
});

// The Team tab's reset wipes an event in one action, so the rules — not just
// the UI — decide who may delete. Everything a team collects is admin-only,
// with one carve-out for withdrawing a talkie request you posted yourself.
describe("deleting collected data", () => {
  it.each(POOLED)("a teammate scout cannot delete teamA's %s", async (collection) => {
    await assertFails(deleteDoc(doc(as("erin"), `teams/teamA/${collection}/doc1`)));
  });

  it.each(POOLED)("teamA's own admin deletes its %s", async (collection) => {
    await assertSucceeds(
      deleteDoc(doc(as("alice"), `teams/teamA/${collection}/doc1`)),
    );
  });

  it("a teammate scout cannot delete teamA's assignments", async () => {
    await assertFails(deleteDoc(doc(as("erin"), "teams/teamA/config/scoutDuties")));
  });

  it("teamA's own admin deletes its assignments", async () => {
    await assertSucceeds(
      deleteDoc(doc(as("alice"), "teams/teamA/config/scoutDuties")),
    );
  });

  it.each(POOLED)("a sister scout cannot delete teamA's %s", async (collection) => {
    await assertFails(deleteDoc(doc(as("bob"), `teams/teamA/${collection}/doc1`)));
  });

  // A pair shares one store, so resetting from either side has to reach it.
  it.each(POOLED)("a sister admin deletes teamA's %s", async (collection) => {
    await assertSucceeds(
      deleteDoc(doc(as("bea"), `teams/teamA/${collection}/doc1`)),
    );
  });

  it("a sister admin still cannot touch teamA's picklist", async () => {
    await assertFails(deleteDoc(doc(as("bea"), "teams/teamA/config/picklist")));
  });

  it("lets a scout withdraw the talkie request they posted", async () => {
    await assertSucceeds(deleteDoc(doc(as("erin"), "teams/teamA/talkie/byErin")));
  });

  it("never lets a scout delete someone else's talkie request", async () => {
    await assertFails(deleteDoc(doc(as("erin"), "teams/teamA/talkie/byBob")));
  });

  it("lets a sister scout withdraw their own pooled talkie request", async () => {
    await assertSucceeds(deleteDoc(doc(as("bob"), "teams/teamA/talkie/byBob")));
  });

  it.each(POOLED)("an unlinked admin cannot delete teamA's %s", async (collection) => {
    await assertFails(deleteDoc(doc(as("carol"), `teams/teamA/${collection}/doc1`)));
  });
});

describe("signed-out access", () => {
  it("reads nothing", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "teams/teamA/pitScouting/doc1")));
  });
});

describe("the pooled list", () => {
  it("names every collection the app reaches through dataTeamId", () => {
    // Guard against the rules and the app drifting apart: if a new pooled
    // collection appears in firestore.rules, it belongs in POOLED above (and
    // therefore in every assertion here) too.
    const rules = readFileSync("firestore.rules", "utf8");
    const sistered = [...rules.matchAll(/match \/([A-Za-z]+)\/\{docId\}/g)]
      .map((m) => m[1])
      .filter((name) => name !== "config");
    expect(sistered.sort()).toEqual([...POOLED].sort());
  });
});
