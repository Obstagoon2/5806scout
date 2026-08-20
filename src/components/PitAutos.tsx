"use client";

import { FieldSketchPad } from "@/components/FieldSketchPad";
import type { SketchStroke } from "@/lib/fieldSketch";
import {
  autoDisplayName,
  MAX_AUTOS_PER_ROBOT,
  newAutoId,
  type PitAutoWithPath,
} from "@/lib/pitAutos";

// The list of auto routines, rendered inside the pit form's Autonomous section
// (see AUTO_SECTION_TITLE). One card per routine: a name and the path it runs.
//
// Not a section of its own, and not schema fields either — a robot runs a
// variable number of autos, which is the one thing a flat one-value-per-field
// schema can't hold. See src/lib/pitAutos.ts.

interface PitAutosProps {
  autos: readonly PitAutoWithPath[];
  onChange: (autos: PitAutoWithPath[]) => void;
}

export function PitAutos({ autos, onChange }: PitAutosProps) {
  function update(id: string, patch: Partial<PitAutoWithPath>) {
    onChange(
      autos.map((auto) => (auto.id === id ? { ...auto, ...patch } : auto)),
    );
  }

  function add() {
    onChange([...autos, { id: newAutoId(), name: "", strokes: [] }]);
  }

  function remove(id: string, label: string) {
    if (!window.confirm(`Remove ${label}? Its path is deleted too.`)) return;
    onChange(autos.filter((auto) => auto.id !== id));
  }

  const atMax = autos.length >= MAX_AUTOS_PER_ROBOT;

  return (
    <div role="group" aria-label="Auto routines" className="flex flex-col gap-4">
      <p className="text-xs italic text-graphite-500">
        One card per routine they can run. The paths you draw here are what the
        Strategy Board stacks on the field before their match.
      </p>

      {autos.map((auto, index) => {
        const label = autoDisplayName(auto, index);
        return (
          <div key={auto.id} className="surface-card flex flex-col gap-3 p-4">
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
          {autos.length === 0 ? "Add an auto" : "Add another auto"}
        </button>
        {atMax && (
          <span className="text-xs text-graphite-500">
            {MAX_AUTOS_PER_ROBOT} is the limit — anything past that is a
            variation, not a separate auto.
          </span>
        )}
      </div>
    </div>
  );
}
