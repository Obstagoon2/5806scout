// Pit Dashboard helpers: pure functions over the TBA match list (mapped to
// EventMatch by eventData.ts) so the page component stays thin and the
// current-match / queue logic is testable without React or the network.

import type { EventMatch } from "@/lib/eventData";

/** Flash the Queuing box when less than this remains before our queue time. */
export const QUEUE_ALERT_MS = 5 * 60_000;

export const COMP_LEVEL_LABELS: Record<string, string> = {
  qm: "Q",
  ef: "EF",
  qf: "QF",
  sf: "SF",
  f: "F",
};

export function matchLabel(match: EventMatch): string {
  return `${COMP_LEVEL_LABELS[match.compLevel] ?? match.compLevel.toUpperCase()}${match.matchNumber}`;
}

export function isPlayed(match: EventMatch): boolean {
  return match.redScore !== null && match.blueScore !== null;
}

/**
 * The match on (or next onto) the field: first unplayed match in schedule
 * order. TBA marks scores as soon as a match finishes, so this tracks the
 * event in near-real time between live polls.
 */
export function currentMatch(matches: readonly EventMatch[]): EventMatch | null {
  return matches.find((m) => !isPlayed(m)) ?? null;
}

export function lastPlayedMatch(
  matches: readonly EventMatch[],
): EventMatch | null {
  for (let i = matches.length - 1; i >= 0; i--) {
    if (isPlayed(matches[i])) return matches[i];
  }
  return null;
}

/** Our team's next unplayed match, or null once we're done for the day. */
export function nextTeamMatch(
  matches: readonly EventMatch[],
  teamNumber: number,
): EventMatch | null {
  return (
    matches.find(
      (m) =>
        !isPlayed(m) && (m.red.includes(teamNumber) || m.blue.includes(teamNumber)),
    ) ?? null
  );
}

/** Milliseconds until the match's scheduled start, or null when TBA has no time. */
export function msUntilMatch(match: EventMatch, now: number): number | null {
  if (match.scheduledTime === null) return null;
  return match.scheduledTime * 1000 - now;
}

/** Format a countdown as h:mm:ss / m:ss; negative values render as "0:00". */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${minutes}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : mmss;
}
