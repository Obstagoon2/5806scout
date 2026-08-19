"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { syncMessage, useSyncState } from "@/lib/offlineSync";

/**
 * Tells the scout what the device is holding: nothing while everything is
 * acknowledged, otherwise how many submissions are queued and why. Without
 * this a scout offline in the stands has no way to tell a saved submission
 * from a lost one.
 */
export function SyncStatus() {
  const { user, dataTeamId } = useAuth();
  const state = useSyncState(dataTeamId, user?.uid ?? null);
  const message = syncMessage(state);
  if (!message) return null;

  const tone = state.failed > 0 ? "badge-error" : "badge-warning";
  return (
    <p
      role="status"
      aria-live="polite"
      className={`${tone} rounded-md px-3 py-2 text-sm normal-case tracking-normal`}
    >
      {message}
    </p>
  );
}
