// Shapes for synced event data (The Blue Alliance + Statbotics) and pure
// mappers from each API's raw payload into them. The API route fetches and
// maps; the Event page writes the mapped result to Firestore so the whole
// team shares one synced copy.

export interface EventTeam {
  teamNumber: number;
  nickname: string;
  city: string;
  /** Statbotics EPA (expected points added) — null when Statbotics has no data. */
  epa: number | null;
  epaRank: number | null;
}

export interface EventMatch {
  key: string;
  compLevel: string; // qm, qf, sf, f
  matchNumber: number;
  red: number[];
  blue: number[];
  redScore: number | null; // null until the match is played
  blueScore: number | null;
  winner: "red" | "blue" | "tie" | null;
  scheduledTime: number | null; // unix seconds
}

export interface EventVenue {
  name: string | null;
  address: string | null;
  city: string | null;
  gmapsUrl: string | null;
  lat: number | null;
  lng: number | null;
}

export interface EventData {
  eventKey: string;
  eventName: string;
  teams: EventTeam[];
  matches: EventMatch[];
  /** Missing on docs synced before venue support shipped. */
  venue?: EventVenue | null;
  syncedAt: number; // unix ms, set client-side on save
}

// --- TBA payload subsets (https://www.thebluealliance.com/apidocs/v3) ---

export interface TbaTeamSimple {
  team_number: number;
  nickname: string | null;
  city: string | null;
}

export interface TbaEvent {
  name: string;
  location_name: string | null;
  address: string | null;
  city: string | null;
  gmaps_url: string | null;
  lat: number | null;
  lng: number | null;
}

export function mapVenue(event: TbaEvent): EventVenue {
  return {
    name: event.location_name,
    address: event.address,
    city: event.city,
    gmapsUrl: event.gmaps_url,
    lat: event.lat,
    lng: event.lng,
  };
}

export interface TbaMatchSimple {
  key: string;
  comp_level: string;
  match_number: number;
  alliances: {
    red: { team_keys: string[]; score: number };
    blue: { team_keys: string[]; score: number };
  };
  winning_alliance: "red" | "blue" | "";
  time: number | null;
  predicted_time: number | null;
}

// --- Statbotics payload subset (https://www.statbotics.io/api/rest) ---

export interface StatboticsTeamEvent {
  team: number;
  team_name?: string | null;
  // Observed live as a plain number; older payloads nested it as { mean }.
  epa: { total_points: number | { mean: number } | null } | null;
  record?: {
    qual?: {
      wins: number;
      losses: number;
      ties: number;
      rps_per_match?: number | null;
      rank?: number | null;
    } | null;
  } | null;
}

function epaTotal(entry: StatboticsTeamEvent): number | null {
  const total = entry.epa?.total_points;
  if (typeof total === "number") return total;
  if (total && typeof total.mean === "number") return total.mean;
  return null;
}

export function teamKeyToNumber(teamKey: string): number {
  // TBA team keys look like "frc5806".
  return Number(teamKey.replace(/^frc/, ""));
}

export function mapTeams(
  tbaTeams: readonly TbaTeamSimple[],
  statbotics: readonly StatboticsTeamEvent[],
): EventTeam[] {
  const epaByTeam = new Map<number, number>();
  for (const entry of statbotics) {
    const total = epaTotal(entry);
    if (total !== null) epaByTeam.set(entry.team, total);
  }

  const ranked = [...epaByTeam.entries()].sort((a, b) => b[1] - a[1]);
  const rankByTeam = new Map(ranked.map(([team], i) => [team, i + 1]));

  return tbaTeams
    .map((t) => ({
      teamNumber: t.team_number,
      nickname: t.nickname ?? String(t.team_number),
      city: t.city ?? "",
      epa: epaByTeam.get(t.team_number) ?? null,
      epaRank: rankByTeam.get(t.team_number) ?? null,
    }))
    .sort((a, b) => a.teamNumber - b.teamNumber);
}

/**
 * Carry EPA and EPA rank forward from the previous sync for teams whose fresh
 * EPA is missing. Used when Statbotics was unreachable during a sync: the team
 * list and schedule from TBA are still fresh and worth saving, but every EPA
 * came back null, and blindly persisting those nulls would wipe the numbers the
 * whole team shares. A fresh non-null EPA always wins.
 */
export function preserveEpa(
  fresh: readonly EventTeam[],
  previous: readonly EventTeam[],
): EventTeam[] {
  const prior = new Map(previous.map((t) => [t.teamNumber, t]));
  return fresh.map((team) => {
    if (team.epa !== null) return team;
    const before = prior.get(team.teamNumber);
    if (!before || before.epa === null) return team;
    return { ...team, epa: before.epa, epaRank: before.epaRank };
  });
}

export interface EventRankingRow {
  rank: number | null;
  teamNumber: number;
  teamName: string;
  wins: number | null;
  losses: number | null;
  ties: number | null;
  rpsPerMatch: number | null;
  epa: number | null;
}

/**
 * Map Statbotics team_events into ranking rows sorted by official qual rank
 * (teams without a rank yet fall to the bottom, ordered by EPA best-first).
 */
export function mapRankings(
  statbotics: readonly StatboticsTeamEvent[],
): EventRankingRow[] {
  return statbotics
    .map((entry) => {
      const qual = entry.record?.qual ?? null;
      return {
        rank: qual?.rank ?? null,
        teamNumber: entry.team,
        teamName: entry.team_name ?? String(entry.team),
        wins: qual?.wins ?? null,
        losses: qual?.losses ?? null,
        ties: qual?.ties ?? null,
        rpsPerMatch: qual?.rps_per_match ?? null,
        epa: epaTotal(entry),
      };
    })
    .sort((a, b) => {
      if (a.rank !== null && b.rank !== null) return a.rank - b.rank;
      if (a.rank !== null) return -1;
      if (b.rank !== null) return 1;
      return (b.epa ?? -Infinity) - (a.epa ?? -Infinity);
    });
}

export function mapMatches(tbaMatches: readonly TbaMatchSimple[]): EventMatch[] {
  const levelOrder: Record<string, number> = { qm: 0, ef: 1, qf: 2, sf: 3, f: 4 };
  return tbaMatches
    .map((m) => {
      const played = m.alliances.red.score >= 0 && m.alliances.blue.score >= 0;
      return {
        key: m.key,
        compLevel: m.comp_level,
        matchNumber: m.match_number,
        red: m.alliances.red.team_keys.map(teamKeyToNumber),
        blue: m.alliances.blue.team_keys.map(teamKeyToNumber),
        redScore: played ? m.alliances.red.score : null,
        blueScore: played ? m.alliances.blue.score : null,
        winner: played
          ? m.winning_alliance === ""
            ? ("tie" as const)
            : m.winning_alliance
          : null,
        scheduledTime: m.time ?? m.predicted_time,
      };
    })
    .sort(
      (a, b) =>
        (levelOrder[a.compLevel] ?? 9) - (levelOrder[b.compLevel] ?? 9) ||
        a.matchNumber - b.matchNumber,
    );
}

// --- Event search (TBA-style typeahead on the Event tab) ---

/** Subset of TBA `/events/{year}/simple`. */
export interface TbaEventSimple {
  key: string;
  name: string;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  start_date: string; // "YYYY-MM-DD"
  end_date: string;
}

export interface EventSearchResult {
  key: string;
  name: string;
  /** "City, State" best-effort — empty string when TBA has neither. */
  location: string;
  startDate: string;
  endDate: string;
}

/**
 * Year the query targets: an explicit 4-digit year anywhere in the query
 * wins (e.g. "2025 hopper"), otherwise the current season.
 */
export function eventSearchYear(query: string, currentYear: number): number {
  const match = query.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : currentYear;
}

/**
 * Filter + rank a season's events for a typeahead query. Every whitespace
 * token must appear somewhere in the event's key/name/location; exact-ish
 * matches (key or name prefix) rank first, then alphabetical by name.
 */
export function searchEvents(
  events: readonly TbaEventSimple[],
  query: string,
  limit = 12,
): EventSearchResult[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const scored = events.flatMap((event) => {
    const key = event.key.toLowerCase();
    const name = event.name.toLowerCase();
    const haystack = [key, name, event.city, event.state_prov, event.country]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!tokens.every((t) => haystack.includes(t))) return [];
    const first = tokens[0];
    const rank =
      key === first || key.replace(/^\d{4}/, "") === first
        ? 0
        : name.startsWith(first)
          ? 1
          : 2;
    return [{ event, rank }];
  });

  return scored
    .sort((a, b) => a.rank - b.rank || a.event.name.localeCompare(b.event.name))
    .slice(0, limit)
    .map(({ event }) => ({
      key: event.key,
      name: event.name,
      location: [event.city, event.state_prov].filter(Boolean).join(", "),
      startDate: event.start_date,
      endDate: event.end_date,
    }));
}
