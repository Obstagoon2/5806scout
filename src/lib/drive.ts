// Drive Dashboard helpers: pure functions that turn match-scout aggregates,
// admin-set point weights, and Statbotics EPA into per-team strength profiles
// and alliance-vs-alliance predictions. Kept free of React and Firestore so
// the math is testable on its own (see drive.test.ts).

import type { TeamAggregate } from "@/lib/aggregate";
import { counterFieldIds } from "@/lib/aggregate";
import type { EventMatch, EventTeam } from "@/lib/eventData";
import type { FormSection } from "@/lib/formSchema";

/** Firestore doc id under teams/{dataTeamId}/config for scoring weights. */
export const SCORING_DOC_ID = "scoring";

/** Points a counter is worth when the admin hasn't set a weight. */
export const DEFAULT_WEIGHT = 1;

/**
 * Point value per counter field id, as saved from Settings → Scoring. The doc
 * is writable by team members under current rules, so shapes are re-checked
 * here rather than trusted (same stance as sanitizeScoutFormsConfig).
 */
export type ScoringWeights = Record<string, number>;

export function sanitizeScoringWeights(data: unknown): ScoringWeights {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return {};
  }
  const raw = (data as Record<string, unknown>).weights;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const weights: ScoringWeights = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      weights[id] = value;
    }
  }
  return weights;
}

/** A counter where a team clearly stands out from the event field. */
export interface FieldEdge {
  fieldId: string;
  /** Team's per-match average for the counter. */
  avg: number;
  /** Mean of that average across every team with scout data. */
  eventAvg: number;
  /** avg / eventAvg (eventAvg is always > 0 for emitted edges). */
  ratio: number;
}

export interface TeamStrengthProfile {
  teamNumber: number;
  /** Predicted points contributed per match. Null when nothing is known. */
  points: number | null;
  /** Where the points figure came from. */
  source: "scouted" | "epa" | "none";
  /** Scouted match count backing the figure (0 for EPA fallback). */
  matches: number;
  strengths: FieldEdge[];
  weaknesses: FieldEdge[];
}

/** A team reads as strong/weak on a counter beyond these ratios. */
const STRENGTH_RATIO = 1.2;
const WEAKNESS_RATIO = 0.8;
/** Cap per list so the dashboard shows the sharpest edges, not every field. */
const MAX_EDGES = 3;

/**
 * Mean of each counter's per-team average across all scouted teams — the
 * event-wide baseline a single team's numbers are judged against.
 */
export function eventFieldAverages(
  sections: readonly FormSection[],
  aggregates: readonly TeamAggregate[],
): Record<string, number> {
  const baseline: Record<string, number> = {};
  if (aggregates.length === 0) return baseline;
  for (const id of counterFieldIds(sections)) {
    const total = aggregates.reduce((sum, a) => sum + (a.averages[id] ?? 0), 0);
    baseline[id] = total / aggregates.length;
  }
  return baseline;
}

/** Weighted points-per-match a team's scouted counter averages add up to. */
export function scoutedPoints(
  sections: readonly FormSection[],
  aggregate: TeamAggregate,
  weights: ScoringWeights,
): number {
  return counterFieldIds(sections).reduce(
    (sum, id) =>
      sum + (aggregate.averages[id] ?? 0) * (weights[id] ?? DEFAULT_WEIGHT),
    0,
  );
}

/**
 * Build one strength profile per team we know anything about. Scouted data
 * wins; teams nobody has scouted yet fall back to Statbotics EPA (also a
 * points-per-match figure, so the two sources sum comparably in an alliance).
 */
export function buildTeamProfiles(
  sections: readonly FormSection[],
  aggregates: readonly TeamAggregate[],
  weights: ScoringWeights,
  eventTeams: readonly EventTeam[],
): Map<number, TeamStrengthProfile> {
  const baseline = eventFieldAverages(sections, aggregates);
  const byTeam = new Map<number, TeamStrengthProfile>();

  for (const aggregate of aggregates) {
    const teamNumber = Number(aggregate.team);
    if (!Number.isInteger(teamNumber)) continue;

    const edges: FieldEdge[] = [];
    for (const [fieldId, eventAvg] of Object.entries(baseline)) {
      if (eventAvg <= 0) continue;
      const avg = aggregate.averages[fieldId] ?? 0;
      edges.push({ fieldId, avg, eventAvg, ratio: avg / eventAvg });
    }
    const strengths = edges
      .filter((e) => e.ratio >= STRENGTH_RATIO)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, MAX_EDGES);
    const weaknesses = edges
      .filter((e) => e.ratio <= WEAKNESS_RATIO)
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, MAX_EDGES);

    byTeam.set(teamNumber, {
      teamNumber,
      points: scoutedPoints(sections, aggregate, weights),
      source: "scouted",
      matches: aggregate.matches,
      strengths,
      weaknesses,
    });
  }

  for (const team of eventTeams) {
    if (byTeam.has(team.teamNumber)) continue;
    byTeam.set(team.teamNumber, {
      teamNumber: team.teamNumber,
      points: team.epa,
      source: team.epa !== null ? "epa" : "none",
      matches: 0,
      strengths: [],
      weaknesses: [],
    });
  }

  return byTeam;
}

export interface AlliancePrediction {
  /** Sum of the alliance's per-team points. Null when no team is known. */
  points: number | null;
  /** Teams with neither scout data nor EPA — the number is partial. */
  unknownTeams: number[];
}

export function predictAlliance(
  teams: readonly number[],
  profiles: ReadonlyMap<number, TeamStrengthProfile>,
): AlliancePrediction {
  let points: number | null = null;
  const unknownTeams: number[] = [];
  for (const teamNumber of teams) {
    const profile = profiles.get(teamNumber);
    if (profile?.points != null) {
      points = (points ?? 0) + profile.points;
    } else {
      unknownTeams.push(teamNumber);
    }
  }
  return { points, unknownTeams };
}

/**
 * Chance the red alliance wins given both predicted point totals — a logistic
 * on the difference, matching the shape Statbotics uses for EPA (a 10-point
 * edge ≈ 64%, 30 ≈ 85%). Purely a readability aid, not a claim of rigor.
 */
export function redWinProbability(
  redPoints: number,
  bluePoints: number,
): number {
  return 1 / (1 + Math.pow(10, -(redPoints - bluePoints) / 40));
}

export interface MatchPrediction {
  match: EventMatch;
  red: AlliancePrediction;
  blue: AlliancePrediction;
  /** Null until both alliances have a points figure. */
  redWinProbability: number | null;
}

export function predictMatch(
  match: EventMatch,
  profiles: ReadonlyMap<number, TeamStrengthProfile>,
): MatchPrediction {
  const red = predictAlliance(match.red, profiles);
  const blue = predictAlliance(match.blue, profiles);
  return {
    match,
    red,
    blue,
    redWinProbability:
      red.points !== null && blue.points !== null
        ? redWinProbability(red.points, blue.points)
        : null,
  };
}

/** All of our team's unplayed matches, in schedule order. */
export function upcomingTeamMatches(
  matches: readonly EventMatch[],
  teamNumber: number,
): EventMatch[] {
  return matches.filter(
    (m) =>
      m.redScore === null &&
      m.blueScore === null &&
      (m.red.includes(teamNumber) || m.blue.includes(teamNumber)),
  );
}
