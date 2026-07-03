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

export interface EventData {
  eventKey: string;
  eventName: string;
  teams: EventTeam[];
  matches: EventMatch[];
  syncedAt: number; // unix ms, set client-side on save
}

// --- TBA payload subsets (https://www.thebluealliance.com/apidocs/v3) ---

export interface TbaTeamSimple {
  team_number: number;
  nickname: string | null;
  city: string | null;
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
  epa: { total_points: { mean: number } | null } | null;
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
    const mean = entry.epa?.total_points?.mean;
    if (typeof mean === "number") epaByTeam.set(entry.team, mean);
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
