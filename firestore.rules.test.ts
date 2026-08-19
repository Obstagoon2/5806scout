import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
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
    await setDoc(doc(db, "users/carol"), { teamId: "teamC", role: "admin" });
    await setDoc(doc(db, "users/dave"), { teamId: "teamD", role: "admin" });

    // teamA's scouting data, which teamB should reach and the others must not.
    for (const collection of POOLED) {
      await setDoc(doc(db, `teams/teamA/${collection}/doc1`), { seeded: true });
    }
    await setDoc(doc(db, "teams/teamA/config/scoutDuties"), { seeded: true });
    await setDoc(doc(db, "teams/teamA/config/picklist"), { seeded: true });
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
