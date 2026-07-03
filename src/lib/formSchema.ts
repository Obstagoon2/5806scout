// Generic schema-driven form definitions. Pit Scout (milestone 2) and Match
// Scout (milestone 3) both render their forms from configs built on these
// types, so each January the team edits a config file — not React components —
// when the new game changes what needs scouting.

export type FieldDef =
  | {
      kind: "select";
      id: string;
      label: string;
      options: readonly string[];
      required?: boolean;
    }
  | {
      kind: "number";
      id: string;
      label: string;
      unit?: string;
      min?: number;
      max?: number;
      required?: boolean;
    }
  | {
      kind: "text";
      id: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      kind: "textarea";
      id: string;
      label: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      kind: "multiselect";
      id: string;
      label: string;
      options: readonly string[];
    }
  | {
      // Tally counter with big +/- buttons — the primary interaction for
      // scoring events live during a match. Always starts at 0.
      kind: "counter";
      id: string;
      label: string;
      max?: number;
    };

export interface FormSection {
  title: string;
  /** Optional note rendered under the section header (e.g. interviewer tips). */
  description?: string;
  fields: readonly FieldDef[];
}

export type FieldValue = string | number | string[] | null;

export type FormValues = Record<string, FieldValue>;

export function emptyValues(sections: readonly FormSection[]): FormValues {
  const values: FormValues = {};
  for (const section of sections) {
    for (const field of section.fields) {
      values[field.id] =
        field.kind === "multiselect" ? [] : field.kind === "counter" ? 0 : null;
    }
  }
  return values;
}

export function missingRequiredFields(
  sections: readonly FormSection[],
  values: FormValues,
): string[] {
  const missing: string[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (!("required" in field) || !field.required) continue;
      const value = values[field.id];
      if (value === null || value === "") {
        missing.push(field.label);
      }
    }
  }
  return missing;
}
