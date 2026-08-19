"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  isEmptyReset,
  resetScoutingData,
  type ResetCounts,
} from "@/lib/resetDataOps";
import { useState } from "react";

// The end-of-season reset, at the very bottom of the Team tab and directly
// below the export — the order is the workflow: download the data, then clear
// it. What actually gets deleted lives in resetDataOps.ts.
//
// Two clicks, not one. The first arms the reset and spells out exactly what
// goes; the second does it. Nothing here is recoverable, and the button sits
// under a roster an admin scrolls past all event, so a stray tap must never
// be enough.

/** Spelled out for the confirm panel — the last thing an admin reads. */
const DELETED = [
  "Pit scouting — every robot's answers, photos, and drawings",
  "Match scouting — every submission, and the reliability flags they built up",
  "Assignments — both scouting rotations, what's been crossed off, and the pit dashboard's progress",
  "Talkie — every request on the board",
];

const KEPT =
  "Your roster, sister-team link, synced event, custom forms, picklist, and pit map are untouched.";

type Status =
  | { state: "idle" }
  | { state: "armed" }
  | { state: "working" }
  | { state: "done"; counts: ResetCounts }
  | { state: "error"; message: string };

/** "3 robots · 41 matches · 2 requests" — proof of what actually went. */
function summarize(counts: ResetCounts): string {
  const parts = [
    [counts.pitScouting, "robot", "robots"],
    [counts.matchScouting, "match submission", "match submissions"],
    [counts.talkie, "talkie request", "talkie requests"],
  ] as const;
  const named = parts
    .filter(([count]) => count > 0)
    .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`);
  return named.length > 0 ? named.join(" · ") : "nothing left to delete";
}

export function DataReset() {
  const { dataTeamId, profile, team } = useAuth();
  const [status, setStatus] = useState<Status>({ state: "idle" });

  // Every store the pair can reach, not just the shared one: linking copies
  // into the canonical team and leaves each side's pre-link docs behind, so
  // clearing only the canonical store would let an unlink bring them back.
  const stores = [dataTeamId, profile?.teamId, team?.sisterTeamId].filter(
    (id): id is string => Boolean(id),
  );

  async function run() {
    if (stores.length === 0) return;
    setStatus({ state: "working" });
    try {
      setStatus({ state: "done", counts: await resetScoutingData(stores) });
    } catch {
      setStatus({
        state: "error",
        message:
          "Couldn't finish the reset — check your connection and try again. Anything already deleted is gone.",
      });
    }
  }

  const working = status.state === "working";

  return (
    <div className="surface-card flex flex-col gap-3 border-maroon-200 p-4 dark:border-maroon-700">
      <div>
        <h2 className="section-title">Reset scouting data</h2>
        <p className="mt-1 text-sm text-graphite-500">
          Clears everything the team collected so the next event starts empty.
          Export first — this can&apos;t be undone.
        </p>
      </div>

      {status.state === "armed" || working ? (
        <div className="badge-error flex flex-col gap-3 rounded-md p-3 text-sm normal-case tracking-normal">
          <p className="font-semibold">
            Permanently delete all scouting data? This deletes:
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {DELETED.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="text-xs">{KEPT}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void run()}
              disabled={working}
              className="btn-primary"
            >
              {working ? "Deleting…" : "Yes, delete everything"}
            </button>
            <button
              type="button"
              onClick={() => setStatus({ state: "idle" })}
              disabled={working}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setStatus({ state: "armed" })}
          disabled={stores.length === 0}
          className="btn-secondary self-start border-maroon-200 text-maroon-700 hover:border-maroon-400 dark:border-maroon-700 dark:text-maroon-300"
        >
          Delete all scouting data
        </button>
      )}

      {status.state === "done" && (
        <p className="badge-success rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {isEmptyReset(status.counts)
            ? "Nothing to delete — the store was already empty."
            : `Deleted ${summarize(status.counts)}. Assignments and reliability flags are cleared too.`}
        </p>
      )}

      {status.state === "error" && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {status.message}
        </p>
      )}
    </div>
  );
}
