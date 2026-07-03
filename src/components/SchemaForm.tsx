"use client";

import type { FieldDef, FormSection, FormValues } from "@/lib/formSchema";

interface SchemaFormProps {
  sections: readonly FormSection[];
  values: FormValues;
  onChange: (id: string, value: FormValues[string]) => void;
}

// Renders any FormSection[] config as a mobile-first form. Tap targets are
// kept large (min 44px) — scouts use this on phones, often in a hurry.
export function SchemaForm({ sections, values, onChange }: SchemaFormProps) {
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section) => (
        <fieldset key={section.title} className="flex flex-col gap-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-maroon-700">
            {section.title}
          </legend>
          {section.description && (
            <p className="-mt-2 text-xs italic text-graphite-500">
              {section.description}
            </p>
          )}
          {section.fields.map((field) => (
            <Field
              key={field.id}
              field={field}
              value={values[field.id]}
              onChange={(value) => onChange(field.id, value)}
            />
          ))}
        </fieldset>
      ))}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-graphite-200 bg-white px-3 py-2.5 text-sm text-graphite-900 outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100";

function Field({
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
          className="flex items-center justify-between gap-3 rounded-md border border-graphite-200 bg-white px-3 py-2"
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
              className="h-11 w-11 rounded-md border border-graphite-200 text-lg font-semibold text-graphite-700 transition hover:border-graphite-300 disabled:opacity-40"
            >
              −
            </button>
            <span className="font-stat w-10 text-center text-lg font-semibold text-graphite-900">
              {count}
            </span>
            <button
              type="button"
              aria-label={`Increase ${field.label}`}
              disabled={atMax}
              onClick={() => onChange(count + 1)}
              className="h-11 w-11 rounded-md bg-maroon-600 text-lg font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-40"
            >
              +
            </button>
          </div>
        </div>
      );
    }
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
                      : "border-graphite-200 bg-white text-graphite-700 hover:border-graphite-300"
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
        {required && <span className="ml-0.5 text-maroon-600">*</span>}
      </span>
      {children}
    </label>
  );
}
