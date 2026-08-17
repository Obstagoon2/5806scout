"use client";

import type { FieldDef, FormSection, FormValues } from "@/lib/formSchema";

// Read-only rendering of one robot's pit scouting answers. Shared by the team
// detail page and the Drive Dash's inline team drawer so a photo, a drawing,
// and a multiselect look the same wherever they're read back.

export function hasAnswer(field: FieldDef, values: FormValues): boolean {
  const value = values[field.id];
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function PitAnswer({
  field,
  value,
  dense,
}: {
  field: FieldDef;
  value: FormValues[string];
  /** Caps image height for the drawer, where space is tight. */
  dense?: boolean;
}) {
  if (field.kind === "drawing" || field.kind === "photo") {
    if (typeof value !== "string") return <>—</>;
    return (
      // Data-URL images from the media doc — next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt={field.label}
        className={`w-auto max-w-full rounded-md border border-graphite-200 ${
          dense ? "max-h-44" : "max-h-80"
        }`}
      />
    );
  }
  if (Array.isArray(value)) return <>{value.join(", ")}</>;
  if (typeof value === "number") return <span className="stat">{value}</span>;
  return <>{String(value)}</>;
}

/**
 * Every answered field, grouped by section. Unanswered fields and sections
 * with nothing in them are dropped — a pit report is usually partial, and
 * rows of em-dashes bury the answers that are actually there.
 */
export function PitAnswerList({
  sections,
  values,
  dense,
}: {
  sections: readonly FormSection[];
  values: FormValues;
  /** Flat, tighter layout for the Drive Dash drawer. */
  dense?: boolean;
}) {
  const answeredSections = sections
    .map((section) => ({
      title: section.title,
      fields: section.fields.filter((field) => hasAnswer(field, values)),
    }))
    .filter((section) => section.fields.length > 0);

  return (
    <>
      {answeredSections.map((section) => (
        <div
          key={section.title}
          className={dense ? "flex flex-col gap-2" : "surface-card p-4"}
        >
          <h3
            className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-maroon-700 dark:text-maroon-300 ${
              dense ? "" : "mb-3"
            }`}
          >
            <span aria-hidden className="h-2.5 w-1 bg-maroon-600" />
            {section.title}
          </h3>
          <dl className={`flex flex-col ${dense ? "gap-2" : "gap-3"}`}>
            {section.fields.map((field) => (
              <div
                key={field.id}
                className={
                  dense
                    ? "flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
                    : "flex flex-col gap-1"
                }
              >
                <dt className="text-xs font-medium uppercase tracking-wider text-graphite-500">
                  {field.label}
                </dt>
                <dd
                  className={`text-sm text-graphite-900 ${
                    dense ? "text-right" : ""
                  }`}
                >
                  <PitAnswer
                    field={field}
                    value={values[field.id] ?? null}
                    dense={dense}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </>
  );
}
