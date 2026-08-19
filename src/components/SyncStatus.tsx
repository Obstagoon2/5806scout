"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { clearSyncFailures, syncMessage, useSyncState } from "@/lib/offlineSync";

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
      className={`${tone} flex items-start gap-2 rounded-md px-3 py-2 text-sm normal-case tracking-normal`}
    >
      <span className="flex-1">{message}</span>
      {/* A rejection count only ever grows, so without this the banner is
          permanent — the scout acknowledges it and gets the ordinary offline
          and syncing messages back. */}
      {state.failed > 0 && (
        <button
          type="button"
          onClick={() => clearSyncFailures()}
          className="shrink-0 font-semibold underline underline-offset-2"
        >
          Dismiss
        </button>
      )}
    </p>
  );
}
