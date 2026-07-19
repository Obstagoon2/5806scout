import type { FieldDef, FormSection } from "@/lib/formSchema";

// Per-team form customization for Pit Scout and Match Scout. Admins tune the
// default schemas (hide questions that don't fit their strategy, add their
// own) from /form-settings; the result is stored at
// teams/{dataTeamId}/config/scoutForms so a linked sister pair scouts with
// one consistent form and the pooled data stays comparable.

export const SCOUT_FORMS_DOC_ID = "scoutForms";

/** Where custom questions land when they don't target an existing section. */
export const CUSTOM_SECTION_TITLE = "Team Questions";

export const CUSTOM_FIELD_KINDS = [
  "select",
  "number",
  "text",
  "textarea",
  "multiselect",
  "counter",
] as const;

export type CustomFieldKind = (typeof CUSTOM_FIELD_KINDS)[number];

export interface CustomField {
  /** Stable value key in submissions — always prefixed "custom_". */
  id: string;
  kind: CustomFieldKind;
  label: string;
  /** Section title to render under; unknown titles become a trailing section. */
  section: string;
  /** Choices for select/multiselect kinds. */
  options?: string[];
  required?: boolean;
}

export interface FormCustomization {
  /** Ids of default-schema fields this team has toggled off. */
  hiddenFieldIds: string[];
  /** Questions this team added on top of the default schema. */
  customFields: CustomField[];
}

export interface ScoutFormsConfig {
  pitScout: FormCustomization;
  matchScout: FormCustomization;
}

export function emptyCustomization(): FormCustomization {
  return { hiddenFieldIds: [], customFields: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sanitizeCustomField(value: unknown): CustomField | null {
  if (!isRecord(value)) return null;
  const { id, kind, label, section, options, required } = value;
  if (typeof id !== "string" || id.trim() === "") return null;
  if (typeof label !== "string" || label.trim() === "") return null;
  if (!CUSTOM_FIELD_KINDS.includes(kind as CustomFieldKind)) return null;

  const cleanOptions = Array.isArray(options)
    ? options.filter((o): o is string => typeof o === "string" && o.trim() !== "")
    : [];
  // A choice field without choices can't be answered — drop it.
  if ((kind === "select" || kind === "multiselect") && cleanOptions.length === 0) {
    return null;
  }

  return {
    id,
    kind: kind as CustomFieldKind,
    label,
    section:
      typeof section === "string" && section.trim() !== ""
        ? section
        : CUSTOM_SECTION_TITLE,
    ...(cleanOptions.length > 0 ? { options: cleanOptions } : {}),
    ...(required === true ? { required: true } : {}),
  };
}

function sanitizeCustomization(value: unknown): FormCustomization {
  if (!isRecord(value)) return emptyCustomization();
  const hiddenFieldIds = Array.isArray(value.hiddenFieldIds)
    ? value.hiddenFieldIds.filter((id): id is string => typeof id === "string")
    : [];
  const customFields = Array.isArray(value.customFields)
    ? value.customFields
        .map(sanitizeCustomField)
        .filter((field): field is CustomField => field !== null)
    : [];
  return { hiddenFieldIds, customFields };
}

/**
 * Parse the raw Firestore doc into a safe config. The doc is writable by any
 * team member under current rules, so every shape assumption is re-checked
 * here rather than trusted.
 */
export function sanitizeScoutFormsConfig(data: unknown): ScoutFormsConfig {
  const record = isRecord(data) ? data : {};
  return {
    pitScout: sanitizeCustomization(record.pitScout),
    matchScout: sanitizeCustomization(record.matchScout),
  };
}

function customFieldToFieldDef(field: CustomField): FieldDef {
  switch (field.kind) {
    case "select":
      return {
        kind: "select",
        id: field.id,
        label: field.label,
        options: field.options ?? [],
        required: field.required,
      };
    case "multiselect":
      return {
        kind: "multiselect",
        id: field.id,
        label: field.label,
        options: field.options ?? [],
      };
    case "counter":
      return { kind: "counter", id: field.id, label: field.label };
    case "number":
      return {
        kind: "number",
        id: field.id,
        label: field.label,
        required: field.required,
      };
    case "text":
      return {
        kind: "text",
        id: field.id,
        label: field.label,
        required: field.required,
      };
    case "textarea":
      return {
        kind: "textarea",
        id: field.id,
        label: field.label,
        required: field.required,
      };
  }
}

/**
 * The team's effective form: default sections minus hidden fields, plus
 * custom questions appended to their target section (or a trailing section
 * when the target doesn't exist). Sections left with no fields disappear.
 */
export function applyCustomization(
  defaults: readonly FormSection[],
  customization: FormCustomization | undefined,
): FormSection[] {
  if (!customization) return [...defaults];

  const hidden = new Set(customization.hiddenFieldIds);
  const sections: { title: string; description?: string; fields: FieldDef[] }[] =
    defaults.map((section) => ({
      title: section.title,
      ...(section.description ? { description: section.description } : {}),
      fields: section.fields.filter((field) => !hidden.has(field.id)),
    }));

  const defaultIds = new Set(
    defaults.flatMap((section) => section.fields.map((field) => field.id)),
  );
  const seen = new Set<string>();
  for (const custom of customization.customFields) {
    // A custom id colliding with a default (or an earlier custom) would make
    // two questions write the same submission key — keep the first only.
    if (defaultIds.has(custom.id) || seen.has(custom.id)) continue;
    seen.add(custom.id);

    let target = sections.find((section) => section.title === custom.section);
    if (!target) {
      target = { title: custom.section, fields: [] };
      sections.push(target);
    }
    target.fields.push(customFieldToFieldDef(custom));
  }

  return sections.filter((section) => section.fields.length > 0);
}

/** Build a unique, readable submission key for a new custom question. */
export function makeCustomFieldId(
  label: string,
  takenIds: ReadonlySet<string>,
): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "question";
  let id = `custom_${slug}`;
  let suffix = 2;
  while (takenIds.has(id)) {
    id = `custom_${slug}_${suffix}`;
    suffix += 1;
  }
  return id;
}
