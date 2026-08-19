"use client";

import { db } from "@/lib/firebase/client";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState, useSyncExternalStore } from "react";

// Sync visibility for the two scouting forms.
//
// The offline queue itself is Firestore's: src/lib/firebase/client.ts turns on
// persistentLocalCache, so a write made in an arena with no signal is applied
// to the IndexedDB cache immediately, survives a reload, and replays when the
// connection returns. What was missing is that nothing told the scout any of
// that had happened — see the note on submitLocally() below.
//
// Pending writes are counted from Firestore's own snapshot metadata rather
// than a second queue of our own: hasPendingWrites is true exactly while a
// document is written locally but not yet acknowledged by the server, and it
// stays correct across reloads, which a hand-rolled outbox would not.

/** Submissions this device wrote that the server hasn't acknowledged yet. */
export interface SyncState {
  /** Local-only match submissions still waiting to reach the server. */
  pendingMatches: number;
  /** Local-only pit submissions still waiting to reach the server. */
  pendingPits: number;
  /** Writes Firestore rejected outright — these will never sync by waiting. */
  failed: number;
  online: boolean;
}

let failedCount = 0;
const failedListeners = new Set<() => void>();

function emitFailed(): void {
  for (const listener of failedListeners) listener();
}

/**
 * Record a write that Firestore refused (a rules violation, say). An offline
 * write is NOT a failure — it stays queued — so only genuine rejections land
 * here, where the sync banner can say so instead of failing silently.
 */
export function recordSyncFailure(): void {
  failedCount += 1;
  emitFailed();
}

export function clearSyncFailures(): void {
  failedCount = 0;
  emitFailed();
}

function subscribeFailed(listener: () => void): () => void {
  failedListeners.add(listener);
  return () => failedListeners.delete(listener);
}

function failedSnapshot(): number {
  return failedCount;
}

/** Current rejected-write count. Exported for tests and for callers that
 *  need the number outside a React render. */
export function syncFailureCount(): number {
  return failedCount;
}

/**
 * Hand a form submission to Firestore without waiting for the server.
 *
 * This is the whole offline fix. Firestore applies the write to its local
 * IndexedDB cache straight away, but the promise it returns does not settle
 * until the SERVER acknowledges — which, offline, is never. Awaiting it left
 * both scout forms stuck on "Submitting…" with no way to reset, so a scout
 * could not record the next match until they found signal. Not awaiting lets
 * the form clear at once and any number of submissions stack up on the device.
 */
export function submitLocally(write: Promise<unknown>): void {
  void write.catch(() => {
    // Offline writes don't reject — they sit in the queue — so reaching here
    // means the server actively refused it and no amount of waiting will fix
    // it. Surface it rather than losing the scout's work quietly.
    recordSyncFailure();
  });
}

/** Live count of this device's unsynced submissions, plus its online state. */
export function useSyncState(
  dataTeamId: string | null,
  scoutUid: string | null,
): SyncState {
  const [pendingMatches, setPendingMatches] = useState(0);
  const [pendingPits, setPendingPits] = useState(0);
  const [online, setOnline] = useState(true);
  const failed = useSyncExternalStore(
    subscribeFailed,
    failedSnapshot,
    () => 0,
  );

  useEffect(() => {
    // Read on mount rather than in useState's initializer: navigator doesn't
    // exist while this renders on the server.
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!dataTeamId || !scoutUid) {
      setPendingMatches(0);
      setPendingPits(0);
      return;
    }
    // Scoped to this scout: pending writes are by definition this device's,
    // and it keeps the listener off the whole event's submission history.
    // includeMetadataChanges is required — without it the snapshot that only
    // flips hasPendingWrites to false never fires.
    const unsubs = (
      [
        ["matchScouting", setPendingMatches],
        ["pitScouting", setPendingPits],
      ] as const
    ).map(([name, setCount]) =>
      onSnapshot(
        query(
          collection(db, "teams", dataTeamId, name),
          where("scoutUid", "==", scoutUid),
        ),
        { includeMetadataChanges: true },
        (snapshot) =>
          setCount(
            snapshot.docs.filter((d) => d.metadata.hasPendingWrites).length,
          ),
        () => setCount(0),
      ),
    );
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [dataTeamId, scoutUid]);

  return { pendingMatches, pendingPits, failed, online };
}

/** The one-line summary the scout forms show, or null when there's nothing
 *  worth saying (online, everything acknowledged). */
export function syncMessage(state: SyncState): string | null {
  const pending = state.pendingMatches + state.pendingPits;
  if (state.failed > 0) {
    return state.failed === 1
      ? "1 submission was rejected and won't sync — tell an admin."
      : `${state.failed} submissions were rejected and won't sync — tell an admin.`;
  }
  if (!state.online) {
    return pending > 0
      ? `Offline — ${pending} submission${pending === 1 ? "" : "s"} saved on this device. They'll sync when you're back online.`
      : "Offline — submissions save to this device and sync when you're back online.";
  }
  if (pending > 0) {
    return `Syncing ${pending} submission${pending === 1 ? "" : "s"}…`;
  }
  return null;
}
