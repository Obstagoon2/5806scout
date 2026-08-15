import type { FormSection, FormValues } from "@/lib/formSchema";

// Photos and drawings answer a form field like anything else, but they're
// three orders of magnitude bigger than a number or a select. Keeping them in
// a sibling doc means the pit-scout page can keep a live listener on the whole
// pitScouting collection (it only wants the team ids) without pulling every
// robot photo at the event down over venue wifi.

/** Field kinds whose value is a data URL rather than a scalar answer. */
const MEDIA_KINDS: ReadonlySet<string> = new Set(["drawing", "photo"]);

export function mediaFieldIds(
  sections: readonly FormSection[],
): Set<string> {
  const ids = new Set<string>();
  for (const section of sections) {
    for (const field of section.fields) {
      if (MEDIA_KINDS.has(field.kind)) ids.add(field.id);
    }
  }
  return ids;
}

/**
 * Split a filled-in form into the values that ride in the main submission and
 * the heavyweight media values that get their own doc. Media keys are absent
 * from `core` entirely, so an old submission's copy can't shadow a cleared one
 * on the merge back.
 */
export function splitMediaValues(
  sections: readonly FormSection[],
  values: FormValues,
): { core: FormValues; media: FormValues } {
  const ids = mediaFieldIds(sections);
  const core: FormValues = {};
  const media: FormValues = {};
  for (const [id, value] of Object.entries(values)) {
    if (ids.has(id)) media[id] = value;
    else core[id] = value;
  }
  return { core, media };
}
