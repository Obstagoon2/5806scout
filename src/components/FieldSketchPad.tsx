"use client";

import {
  FIELD_MAP_SRC,
  paintField,
  paintStrokes,
  PEN_COLORS,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  type SketchPoint,
  type SketchStroke,
} from "@/lib/fieldSketch";
import { useEffect, useRef, useState } from "react";

// A field you draw on whose value is the strokes themselves, not a flattened
// picture of them. That is the whole difference from DrawingPad (which backs
// the generic `drawing` form field and has to keep emitting an image): strokes
// can be replayed onto someone else's canvas, recolored, and stacked, which is
// what the Strategy Board does with a robot's auto path.

/** Loads the field photo once per mount and hands back the decoded image. */
export function useFieldImage(): HTMLImageElement | null {
  const [field, setField] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setField(img);
    };
    // No onerror handler on purpose: paintField draws a generic field when
    // the photo is missing, so a failure costs accuracy, not the canvas.
    img.src = FIELD_MAP_SRC;
    return () => {
      cancelled = true;
    };
  }, []);
  return field;
}

/** Canvas coordinates for a pointer event, mapped through the rendered box. */
export function sketchPointFrom(
  event: React.PointerEvent<HTMLCanvasElement>,
): SketchPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * SKETCH_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * SKETCH_HEIGHT,
  };
}

/** Shared canvas geometry — the aspect ratio must match the bitmap above, or
 *  strokes land off the fingertip. */
export const SKETCH_CANVAS_CLASS =
  "aspect-[40/21] h-auto w-full touch-none rounded-md border border-graphite-200 bg-surface";

const PEN_WIDTH = 5;

interface FieldSketchPadProps {
  label: string;
  hint?: string;
  strokes: readonly SketchStroke[];
  onChange: (strokes: SketchStroke[]) => void;
}

export function FieldSketchPad({
  label,
  hint,
  strokes,
  onChange,
}: FieldSketchPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const field = useFieldImage();
  const [color, setColor] = useState<string>(PEN_COLORS[0].value);
  // The stroke under the finger. Held in a ref and mutated in place for
  // smoothness; each move re-emits so the parent stays the single source of
  // truth for what has been drawn.
  const drawing = useRef<SketchStroke | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    paintField(ctx, field);
    paintStrokes(ctx, strokes);
  }, [field, strokes]);

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: SketchStroke = {
      color,
      width: PEN_WIDTH,
      points: [sketchPointFrom(event)],
    };
    drawing.current = stroke;
    onChange([...strokes, stroke]);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawing.current;
    if (!stroke) return;
    stroke.points.push(sketchPointFrom(event));
    // Copy the array so React sees a new reference and repaints; the stroke
    // object inside it is the same one, already extended.
    onChange([...strokes]);
  }

  function handlePointerUp() {
    drawing.current = null;
  }

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-graphite-700">{label}</span>
      {hint && <p className="text-xs text-graphite-500">{hint}</p>}

      <canvas
        ref={canvasRef}
        width={SKETCH_WIDTH}
        height={SKETCH_HEIGHT}
        aria-label={`${label} — drawing area`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={SKETCH_CANVAS_CLASS}
      />

      <div className="flex flex-wrap items-center gap-2">
        {PEN_COLORS.map((pen) => (
          <button
            key={pen.value}
            type="button"
            aria-label={pen.name}
            aria-pressed={color === pen.value}
            onClick={() => setColor(pen.value)}
            style={{ backgroundColor: pen.value }}
            className={`h-8 w-8 rounded-full border-2 transition ${
              color === pen.value
                ? "border-graphite-900 dark:border-graphite-100"
                : "border-transparent"
            }`}
          />
        ))}
        <button
          type="button"
          onClick={() => onChange(strokes.slice(0, -1))}
          disabled={strokes.length === 0}
          className="btn-secondary ml-auto disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={strokes.length === 0}
          className="btn-secondary disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
