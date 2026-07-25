// Reliability flags: when a match scout marks a robot as having a reliability
// issue, we record it against that team number so a warning triangle can show
// up everywhere the team is listed. Stored as one small doc per team store at
// teams/{dataTeamId}/config/reliabilityFlags — a single subscription feeds
// every surface (see ReliabilityProvider), so table rows stay cheap.

export const RELIABILITY_FLAGS_DOC_ID = "reliabilityFlags";

export interface ReliabilityFlag {
  /** Scout who last flagged the team, for the tooltip. */
  flaggedByName: string;
  /** Match the most recent flag came from (0 when unknown). */
  matchNumber: number;
  updatedAtMs: number;
}

export interface ReliabilityFlagsDoc {
  /** Keyed by team number (string). Presence = an active reliability concern. */
  teams: Record<string, ReliabilityFlag>;
}

/** Coerce a raw Firestore snapshot into a well-typed flags map, dropping any
 *  malformed entries so a bad write can't crash every team list. */
export function sanitizeReliabilityFlags(
  raw: unknown,
): Record<string, ReliabilityFlag> {
  if (!raw || typeof raw !== "object") return {};
  const teams = (raw as { teams?: unknown }).teams;
  if (!teams || typeof teams !== "object") return {};
  const out: Record<string, ReliabilityFlag> = {};
  for (const [team, value] of Object.entries(teams as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Partial<ReliabilityFlag>;
    out[team] = {
      flaggedByName: typeof v.flaggedByName === "string" ? v.flaggedByName : "",
      matchNumber: typeof v.matchNumber === "number" ? v.matchNumber : 0,
      updatedAtMs: typeof v.updatedAtMs === "number" ? v.updatedAtMs : 0,
    };
  }
  return out;
}

/** Human tooltip for a flagged team, e.g. "Reliability issue flagged by Sam
 *  (Q12)". Falls back gracefully when the metadata is missing. */
export function reliabilityTooltip(flag: ReliabilityFlag): string {
  const who = flag.flaggedByName ? ` by ${flag.flaggedByName}` : "";
  const when = flag.matchNumber ? ` (Q${flag.matchNumber})` : "";
  return `Reliability issue flagged${who}${when}`;
}
