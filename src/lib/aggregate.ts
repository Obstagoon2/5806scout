import type { FormSection, FormValues } from "@/lib/formSchema";

// A stored match-scout submission, as written by the Match Scout page.
export interface MatchSubmission {
  id: string;
  matchNumber: number;
  scoutedTeam: string;
  alliance: "red" | "blue";
  values: FormValues;
  scoutName: string;
}

export interface TeamAggregate {
  team: string;
  matches: number;
  /** Average per match for every counter field id in the schema. */
  averages: Record<string, number>;
  /** Most common value for every select field id (null if never answered). */
  modes: Record<string, string | null>;
  /**
   * Every per-match value behind `averages`, one array per counter field id,
   * so a view can ask for a median or a spread without re-grouping the
   * submissions. `averages` stays the canonical figure — scoring, alliance
   * odds, and the Drive Dash all read it and must not shift because someone
   * changed how a table is displayed.
   */
  samples: Record<string, number[]>;
}

/**
 * Percentile of an already-sorted sample by linear interpolation — the R-7
 * definition NumPy, R, and Excel's PERCENTILE.INC all default to. Teams play
 * eight to twelve quals, so the quartile definition visibly moves the number;
 * this is the one people will have seen elsewhere.
 */
export function percentileOfSorted(
  sorted: readonly number[],
  p: number,
): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = p * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Middle value — unmoved by the one match where everything went wrong. */
export function median(values: readonly number[]): number | null {
  return percentileOfSorted(sortedCopy(values), 0.5);
}

/**
 * Q3 − Q1: how wide the middle half of a team's matches is. Small means you
 * can count on them; large means their average is hiding a coin flip.
 */
export function interquartileRange(values: readonly number[]): number | null {
  const sorted = sortedCopy(values);
  const q1 = percentileOfSorted(sorted, 0.25);
  const q3 = percentileOfSorted(sorted, 0.75);
  return q1 === null || q3 === null ? null : q3 - q1;
}

/**
 * A counter answer as a number, for sorting and for the mean/median alike.
 *
 * Anything non-numeric reads as 0 — a skipped question, a field that changed
 * kind, a value a past client stored as text. Numeric strings are parsed
 * rather than zeroed: treating "850" as 0 doesn't just mis-sort the row (it
 * lands among the zeros instead of at the end), it quietly drags the team's
 * average down by a whole match.
 */
export function counterNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return 0;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function counterFieldIds(sections: readonly FormSection[]): string[] {
  return sections.flatMap((s) =>
    s.fields.filter((f) => f.kind === "counter").map((f) => f.id),
  );
}

export function selectFieldIds(sections: readonly FormSection[]): string[] {
  return sections.flatMap((s) =>
    s.fields.filter((f) => f.kind === "select").map((f) => f.id),
  );
}

export function aggregateByTeam(
  sections: readonly FormSection[],
  submissions: readonly MatchSubmission[],
): TeamAggregate[] {
  const counters = counterFieldIds(sections);
  const selects = selectFieldIds(sections);

  const byTeam = new Map<string, MatchSubmission[]>();
  for (const submission of submissions) {
    const list = byTeam.get(submission.scoutedTeam) ?? [];
    list.push(submission);
    byTeam.set(submission.scoutedTeam, list);
  }

  const aggregates: TeamAggregate[] = [];
  for (const [team, teamSubmissions] of byTeam) {
    const averages: Record<string, number> = {};
    const samples: Record<string, number[]> = {};
    for (const id of counters) {
      // A match that never answered this counter reads as 0, the same way it
      // already counted toward the average — the mean and the median have to
      // be describing the same set of matches.
      const values = teamSubmissions.map((s) => counterNumber(s.values[id]));
      samples[id] = values;
      averages[id] = values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    const modes: Record<string, string | null> = {};
    for (const id of selects) {
      const counts = new Map<string, number>();
      for (const s of teamSubmissions) {
        const value = s.values[id];
        if (typeof value === "string" && value) {
          counts.set(value, (counts.get(value) ?? 0) + 1);
        }
      }
      let best: string | null = null;
      let bestCount = 0;
      for (const [value, count] of counts) {
        if (count > bestCount) {
          best = value;
          bestCount = count;
        }
      }
      modes[id] = best;
    }

    aggregates.push({
      team,
      matches: teamSubmissions.length,
      averages,
      modes,
      samples,
    });
  }

  return aggregates.sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true }));
}
