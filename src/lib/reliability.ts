// Reliability flags: when a match scout marks a robot as having a reliability
// issue, we record the match it happened in against that team number. A single
// bad match is a note on that match alone — it takes a pattern (more than a
// third of the team's scouted matches) before the warning follows the team
// everywhere it's listed.
//
// Stored as one small doc per team store at
// teams/{dataTeamId}/config/reliabilityFlags — a single subscription feeds every
// surface (see ReliabilityProvider), so table rows stay cheap. Both match lists
// are written with arrayUnion so concurrent scouts can't clobber each other and
// duplicates collapse on their own.

export const RELIABILITY_FLAGS_DOC_ID = "reliabilityFlags";

/**
 * Fraction of a team's scouted matches that must carry a reliability flag
 * before the warning escalates from match-scoped to team-wide. Compared
 * strictly greater-than, and with integer math to dodge float rounding.
 */
export const RELIABILITY_TEAM_WIDE_NUMERATOR = 1;
export const RELIABILITY_TEAM_WIDE_DENOMINATOR = 3;

export interface TeamReliability {
  /** Distinct match numbers a scout flagged an issue in. */
  flaggedMatches: number[];
  /** Distinct match numbers scouted for this team — the ratio's denominator. */
  scoutedMatches: number[];
  /** Scout who last flagged the team, for the tooltip. */
  flaggedByName: string;
  updatedAtMs: number;
}

export interface ReliabilityFlagsDoc {
  /** Keyed by team number (string). */
  teams: Record<string, TeamReliability>;
}

function numberList(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  for (const v of raw) {
    if (typeof v === "number" && Number.isFinite(v)) seen.add(v);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Coerce a raw Firestore snapshot into a well-typed flags map, dropping any
 *  malformed entries so a bad write can't crash every team list. */
export function sanitizeReliabilityFlags(
  raw: unknown,
): Record<string, TeamReliability> {
  if (!raw || typeof raw !== "object") return {};
  const teams = (raw as { teams?: unknown }).teams;
  if (!teams || typeof teams !== "object") return {};
  const out: Record<string, TeamReliability> = {};
  for (const [team, value] of Object.entries(teams as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Partial<TeamReliability> & { matchNumber?: unknown };
    const flaggedMatches = numberList(v.flaggedMatches);
    // Docs written before the counter shipped stored only the most recent
    // flagged match as `matchNumber`. Carry it over so old flags don't vanish.
    if (flaggedMatches.length === 0 && typeof v.matchNumber === "number" && v.matchNumber) {
      flaggedMatches.push(v.matchNumber);
    }
    out[team] = {
      flaggedMatches,
      scoutedMatches: numberList(v.scoutedMatches),
      flaggedByName: typeof v.flaggedByName === "string" ? v.flaggedByName : "",
      updatedAtMs: typeof v.updatedAtMs === "number" ? v.updatedAtMs : 0,
    };
  }
  return out;
}

/** Matches scouted for this team, never undercounting the flagged ones — a
 *  flagged match is by definition a scouted match, even if a legacy doc or a
 *  dropped write left it out of `scoutedMatches`. */
export function scoutedMatchCount(team: TeamReliability): number {
  const all = new Set([...team.scoutedMatches, ...team.flaggedMatches]);
  return all.size;
}

/**
 * True when reliability issues span more than a third of the team's scouted
 * matches — the point where the warning stops being about one match and starts
 * being about the robot, so it shows everywhere the team appears.
 *
 * Legacy docs carry a flag but no scouted-match history; those stay team-wide,
 * matching the behaviour they already had rather than silently going quiet.
 */
export function isTeamWideConcern(team: TeamReliability): boolean {
  const flagged = team.flaggedMatches.length;
  if (flagged === 0) return false;
  const scouted = scoutedMatchCount(team);
  return (
    flagged * RELIABILITY_TEAM_WIDE_DENOMINATOR >
    scouted * RELIABILITY_TEAM_WIDE_NUMERATOR
  );
}

/** True when this specific match carries a flag. */
export function isMatchFlagged(
  team: TeamReliability,
  matchNumber: number,
): boolean {
  return team.flaggedMatches.includes(matchNumber);
}

/** Human tooltip. Team-wide reads as a pattern ("3 of 8 matches"); a lone flag
 *  names the match it came from so it's clearly scoped to that match. */
export function reliabilityTooltip(team: TeamReliability): string {
  const who = team.flaggedByName ? ` by ${team.flaggedByName}` : "";
  const flagged = team.flaggedMatches.length;

  if (isTeamWideConcern(team)) {
    const scouted = scoutedMatchCount(team);
    return `Reliability issues in ${flagged} of ${scouted} scouted ${
      scouted === 1 ? "match" : "matches"
    }${who}`;
  }

  const matches = team.flaggedMatches.map((m) => `Q${m}`).join(", ");
  const where = matches ? ` (${matches})` : "";
  return `Reliability issue flagged${who}${where}`;
}
