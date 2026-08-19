import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

import {
  clearSyncFailures,
  submitLocally,
  syncFailureCount,
  syncMessage,
  type SyncState,
} from "./offlineSync";

function state(over: Partial<SyncState> = {}): SyncState {
  return {
    pendingMatches: 0,
    pendingPits: 0,
    failed: 0,
    online: true,
    ...over,
  };
}

afterEach(() => {
  clearSyncFailures();
});

describe("syncMessage", () => {
  it("says nothing when online with everything acknowledged", () => {
    expect(syncMessage(state())).toBeNull();
  });

  it("explains offline saving even before anything is queued", () => {
    expect(syncMessage(state({ online: false }))).toMatch(/save to this device/);
  });

  it("counts match and pit submissions together while offline", () => {
    expect(
      syncMessage(state({ online: false, pendingMatches: 2, pendingPits: 1 })),
    ).toMatch(/3 submissions saved on this device/);
  });

  it("uses the singular for one queued submission", () => {
    const message = syncMessage(state({ online: false, pendingMatches: 1 }));
    expect(message).toMatch(/1 submission saved/);
    expect(message).not.toMatch(/submissions/);
  });

  it("reports syncing once back online with writes outstanding", () => {
    expect(syncMessage(state({ pendingMatches: 2 }))).toMatch(
      /Syncing 2 submissions/,
    );
  });

  it("puts rejected writes ahead of the offline notice — waiting won't fix those", () => {
    const message = syncMessage(
      state({ online: false, pendingMatches: 3, failed: 1 }),
    );
    expect(message).toMatch(
      /^1 submission was rejected and won't sync — tell an admin\./,
    );
  });

  it("still reports the queue behind a rejection, which is sticky until dismissed", () => {
    // Regression: returning early on failed > 0 meant a single rejection hid
    // the offline state and queue count for the rest of the session.
    const message = syncMessage(
      state({ online: false, pendingMatches: 3, failed: 1 }),
    );
    expect(message).toMatch(/3 submissions saved on this device/);
  });

  it("still reports syncing behind a rejection once back online", () => {
    expect(syncMessage(state({ pendingMatches: 2, failed: 1 }))).toMatch(
      /Syncing 2 submissions/,
    );
  });

  it("agrees the verb with the number of rejected writes", () => {
    expect(syncMessage(state({ failed: 2 }))).toMatch(
      /2 submissions were rejected/,
    );
  });
});

describe("submitLocally", () => {
  it("does not reject when the write is refused, so the form still resets", async () => {
    expect(() =>
      submitLocally(Promise.reject(new Error("permission denied"))),
    ).not.toThrow();
    await Promise.resolve();
  });

  it("counts a refused write as a sync failure", async () => {
    submitLocally(Promise.reject(new Error("permission denied")));
    // Let the rejection handler run before reading the count.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(syncFailureCount()).toBe(1);
  });

  it("leaves the failure count alone for a write that lands", async () => {
    submitLocally(Promise.resolve("ok"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(syncFailureCount()).toBe(0);
  });
});
