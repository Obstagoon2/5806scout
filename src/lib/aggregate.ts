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
    for (const id of counters) {
      const total = teamSubmissions.reduce(
        (sum, s) => sum + (typeof s.values[id] === "number" ? (s.values[id] as number) : 0),
        0,
      );
      averages[id] = total / teamSubmissions.length;
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

    aggregates.push({ team, matches: teamSubmissions.length, averages, modes });
  }

  return aggregates.sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true }));
}
