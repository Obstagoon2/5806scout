"use client";

import { FieldSketchPad } from "@/components/FieldSketchPad";
import type { SketchStroke } from "@/lib/fieldSketch";
import {
  autoDisplayName,
  MAX_AUTOS_PER_ROBOT,
  newAutoId,
  type PitAutoWithPath,
} from "@/lib/pitAutos";

// The pit form's Autos section: one card per routine, added and removed by the
// scout. Lives outside SchemaForm because a robot runs a variable number of
// autos and the schema is one answer per field — see src/lib/pitAutos.ts.

interface PitAutosProps {
  autos: readonly PitAutoWithPath[];
  onChange: (autos: PitAutoWithPath[]) => void;
  /** Locked until a robot is open, same as the rest of the form. */
  disabled?: boolean;
}

export function PitAutos({ autos, onChange, disabled }: PitAutosProps) {
  function update(id: string, patch: Partial<PitAutoWithPath>) {
    onChange(
      autos.map((auto) => (auto.id === id ? { ...auto, ...patch } : auto)),
    );
  }

  function add() {
    onChange([
      ...autos,
      { id: newAutoId(), name: "", notes: "", strokes: [] },
    ]);
  }

  function remove(id: string, label: string) {
    if (!window.confirm(`Remove ${label}? Its path is deleted too.`)) return;
    onChange(autos.filter((auto) => auto.id !== id));
  }

  const atMax = autos.length >= MAX_AUTOS_PER_ROBOT;

  return (
    <fieldset className="flex flex-col gap-4" disabled={disabled}>
      <legend className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-maroon-700 dark:text-maroon-300">
        <span aria-hidden className="h-2.5 w-1 bg-maroon-600" />
        Autos
      </legend>
      <p className="-mt-2 text-xs italic text-graphite-500">
        One card per routine they can run. The paths you draw here are what the
        Strategy Board stacks on the field before their match.
      </p>

      {autos.length === 0 && (
        <p className="rounded-md border border-dashed border-graphite-200 px-3 py-4 text-center text-sm text-graphite-500">
          No autos recorded yet.
        </p>
      )}

      {autos.map((auto, index) => {
        const label = autoDisplayName(auto, index);
        return (
          <div
            key={auto.id}
            className="surface-card flex flex-col gap-3 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="stat text-xs uppercase tracking-widest text-graphite-500">
                Auto {index + 1}
              </span>
              <button
                type="button"
                onClick={() => remove(auto.id, label)}
                className="btn-ghost border border-graphite-200 px-3 py-1.5 text-xs"
              >
                Remove
              </button>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-graphite-700">
                Name
              </span>
              <input
                type="text"
                value={auto.name}
                placeholder="3-piece left, far-side taxi…"
                onChange={(e) => update(auto.id, { name: e.target.value })}
                className="field-input"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-graphite-700">
                What it does
              </span>
              <textarea
                rows={2}
                value={auto.notes}
                placeholder="Starting position, what it scores, how long it takes…"
                onChange={(e) => update(auto.id, { notes: e.target.value })}
                className="field-input"
              />
            </label>

            <FieldSketchPad
              label={`${label} — path`}
              hint="Sketch their starting spot and the path they run. Red zone is left, blue is right."
              strokes={auto.strokes}
              onChange={(strokes: SketchStroke[]) =>
                update(auto.id, { strokes })
              }
            />
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={add}
          disabled={atMax}
          className="btn-secondary px-4 py-2 disabled:opacity-40"
        >
          Add an auto
        </button>
        {atMax && (
          <span className="text-xs text-graphite-500">
            {MAX_AUTOS_PER_ROBOT} is the limit — anything past that is a
            variation, not a separate auto.
          </span>
        )}
      </div>
    </fieldset>
  );
}
