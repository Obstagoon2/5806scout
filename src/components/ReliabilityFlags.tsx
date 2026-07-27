"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { db } from "@/lib/firebase/client";
import {
  RELIABILITY_FLAGS_DOC_ID,
  isMatchFlagged,
  isTeamWideConcern,
  reliabilityTooltip,
  sanitizeReliabilityFlags,
  type TeamReliability,
} from "@/lib/reliability";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";

type FlagsMap = Record<string, TeamReliability>;

const ReliabilityContext = createContext<FlagsMap>({});

/**
 * Subscribes once to the team's reliability-flags doc and shares the map with
 * every descendant. Mounted in the app shell so any team list can render a
 * warning without opening its own Firestore listener.
 */
export function ReliabilityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dataTeamId } = useAuth();
  const [flags, setFlags] = useState<FlagsMap>({});

  useEffect(() => {
    if (!dataTeamId) {
      setFlags({});
      return;
    }
    return onSnapshot(
      doc(db, "teams", dataTeamId, "config", RELIABILITY_FLAGS_DOC_ID),
      (snapshot) => setFlags(sanitizeReliabilityFlags(snapshot.data())),
    );
  }, [dataTeamId]);

  return (
    <ReliabilityContext.Provider value={flags}>
      {children}
    </ReliabilityContext.Provider>
  );
}

export function useReliabilityFlags(): FlagsMap {
  return useContext(ReliabilityContext);
}

/**
 * A caution triangle shown next to a team number. Renders nothing for teams
 * with no relevant flag, so it's safe to drop beside any team label.
 * `teamNumber` is coerced to string to match how the flags are keyed (match
 * scout stores the raw team-number string).
 *
 * Pass `matchNumber` in a per-match context (a scouting submission row) and the
 * triangle shows for that match's own flag, amber, scoped to that row. Omit it
 * in team-level contexts (team lists, picklist, aggregates) and the triangle
 * only appears once issues span more than a third of the team's matches — at
 * which point it turns red and follows the team everywhere, including over
 * match rows that were never individually flagged.
 */
export function ReliabilityWarning({
  teamNumber,
  matchNumber,
  className = "",
}: {
  teamNumber: string | number;
  matchNumber?: number;
  className?: string;
}) {
  const flags = useReliabilityFlags();
  const team = flags[String(teamNumber).trim()];
  if (!team) return null;

  const teamWide = isTeamWideConcern(team);
  const thisMatch = matchNumber !== undefined && isMatchFlagged(team, matchNumber);
  if (!teamWide && !thisMatch) return null;

  const tooltip = reliabilityTooltip(team);
  return (
    <span
      role="img"
      aria-label={tooltip}
      title={tooltip}
      className={`inline-flex align-middle ${
        teamWide ? "text-red-600 dark:text-red-400" : "text-amber-500"
      } ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    </span>
  );
}
