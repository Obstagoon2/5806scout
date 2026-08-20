"use client";

import { DrawingPad } from "@/components/DrawingPad";
import { PhotoCapture } from "@/components/PhotoCapture";
import type { FieldDef, FormSection, FormValues } from "@/lib/formSchema";

interface SchemaFormProps {
  sections: readonly FormSection[];
  values: FormValues;
  onChange: (id: string, value: FormValues[string]) => void;
  /**
   * Extra content rendered inside a section, after its questions, keyed by
   * section title. For answers a flat one-value-per-field schema can't hold —
   * the pit form's list of auto routines is the only one so far.
   *
   * Titles are already the join key between a section and the questions an
   * admin adds to it (see customForms.ts), so they are the key here too. A
   * section an admin has deleted takes its slot with it, which is the same
   * thing that happens to its questions.
   */
  sectionSlots?: Record<string, React.ReactNode>;
}

// Renders any FormSection[] config as a mobile-first form. Tap targets are
// kept large (min 44px) — scouts use this on phones, often in a hurry.
export function SchemaForm({
  sections,
  values,
  onChange,
  sectionSlots,
}: SchemaFormProps) {
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <fieldset key={section.title} className="flex flex-col gap-4">
          <legend className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-maroon-700 dark:text-maroon-300">
            <span aria-hidden className="h-2.5 w-1 bg-maroon-600" />
            {section.title}
          </legend>
          {section.description && (
            <p className="-mt-2 text-xs italic text-graphite-500">
              {section.description}
            </p>
          )}
          {section.fields.map((field) => (
            <SchemaField
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(value) => onChange(field.id, value)}
            />
          ))}
          {sectionSlots?.[section.title]}
        </fieldset>
      ))}
    </div>
  );
}

const inputClass = "field-input";

// Exported so the bespoke Match Scout screen can render the questions a team
// added from Form Setup with the same controls as the schema-driven forms.
export function SchemaField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: FormValues[string];
  onChange: (value: FormValues[string]) => void;
}) {
  switch (field.kind) {
    case "select":
      return (
        <Labeled label={field.label} required={field.required}>
          <select
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Labeled>
      );
    case "number":
      return (
        <Labeled
          label={field.unit ? `${field.label} (${field.unit})` : field.label}
          required={field.required}
        >
          <input
            type="number"
            inputMode="decimal"
            min={field.min}
            max={field.max}
            value={(value as number) ?? ""}
            onChange={(e) =>
              onChange(e.target.value === "" ? null : Number(e.target.value))
            }
            className={`${inputClass} font-stat`}
          />
        </Labeled>
      );
    case "text":
      return (
        <Labeled label={field.label} required={field.required}>
          <input
            type="text"
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputClass}
          />
        </Labeled>
      );
    case "textarea":
      return (
        <Labeled label={field.label} required={field.required}>
          <textarea
            rows={3}
            placeholder={field.placeholder}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className={inputClass}
          />
        </Labeled>
      );
    case "counter": {
      const count = (value as number) ?? 0;
      const atMax = field.max !== undefined && count >= field.max;
      return (
        <div
          role="group"
          aria-label={field.label}
          className="surface-card flex items-center justify-between gap-3 px-3 py-2"
        >
          <span className="text-sm font-medium text-graphite-700">
            {field.label}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Decrease ${field.label}`}
              disabled={count <= 0}
              onClick={() => onChange(count - 1)}
              className="h-11 w-11 rounded-md border border-graphite-200 text-lg font-semibold text-graphite-700 transition hover:border-graphite-300 active:bg-graphite-100 disabled:opacity-40"
            >
              −
            </button>
            <span className="stat w-10 text-center text-lg font-semibold text-graphite-900">
              {count}
            </span>
            <button
              type="button"
              aria-label={`Increase ${field.label}`}
              disabled={atMax}
              onClick={() => onChange(count + 1)}
              className="h-11 w-11 rounded-md bg-maroon-600 text-lg font-semibold text-white transition hover:bg-maroon-700 active:bg-maroon-800 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      );
    }
    case "drawing":
      return (
        <DrawingPad
          label={field.label}
          hint={field.hint}
          required={field.required}
          value={(value as string) ?? null}
          onChange={onChange}
        />
      );
    case "photo":
      return (
        <PhotoCapture
          label={field.label}
          hint={field.hint}
          required={field.required}
          value={(value as string) ?? null}
          onChange={onChange}
        />
      );
    case "multiselect": {
      const selected = (value as string[]) ?? [];
      // Not a <label>: wrapping buttons in a label steals their accessible
      // names (the label text becomes the name of the first labelable child).
      return (
        <div role="group" aria-label={field.label} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-graphite-700">
            {field.label}
          </span>
          <div className="flex flex-wrap gap-2">
            {field.options.map((option) => {
              const isOn = selected.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={isOn}
                  onClick={() =>
                    onChange(
                      isOn
                        ? selected.filter((item) => item !== option)
                        : [...selected, option],
                    )
                  }
                  className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                    isOn
                      ? "border-maroon-600 bg-maroon-600 text-white"
                      : "border-graphite-200 bg-surface text-graphite-700 hover:border-graphite-300"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
  }
}

function Labeled({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-graphite-700">
        {label}
        {required && <span className="ml-0.5 text-maroon-600 dark:text-maroon-400">*</span>}
      </span>
      {children}
    </label>
  );
}
