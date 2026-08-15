"use client";

import { useEffect, useRef, useState } from "react";

// Freehand sketch pad for auto paths. Scouts draw on a field backdrop with a
// finger or a stylus; the result is flattened to a PNG data URL so it stores
// and renders anywhere a plain field value does.

/** Internal canvas resolution — the element itself scales to its container. */
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;

/** A sketch shares the submission doc with every other answer, so it gets a
 *  budget well under Firestore's 1 MB cap. Line art is nowhere near this. */
const MAX_DRAWING_BYTES = 300_000;

const TOO_BIG_MESSAGE =
  "This sketch got too detailed to save — undo a few strokes and try again.";

/** PNG keeps line art crisp; the JPEG pass is a fallback for a sketch dense
 *  enough to blow the budget. Null means neither fits — the caller must not
 *  emit, or the save would bounce off Firestore's doc limit. */
function encodeCanvas(canvas: HTMLCanvasElement): string | null {
  const png = canvas.toDataURL("image/png");
  if (png.length <= MAX_DRAWING_BYTES) return png;
  const jpeg = canvas.toDataURL("image/jpeg", 0.8);
  return jpeg.length <= MAX_DRAWING_BYTES ? jpeg : null;
}

const PEN_COLORS = [
  { name: "Red alliance", value: "#9f1239" },
  { name: "Blue alliance", value: "#0369a1" },
  { name: "Graphite", value: "#1f2937" },
] as const;

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  width: number;
  points: Point[];
}

interface DrawingPadProps {
  label: string;
  hint?: string;
  required?: boolean;
  /** PNG data URL, or null when nothing has been drawn yet. */
  value: string | null;
  onChange: (value: string | null) => void;
}

export function DrawingPad({
  label,
  hint,
  required,
  value,
  onChange,
}: DrawingPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Strokes drawn in this session — what Undo walks back. A drawing loaded
  // from a saved submission comes back as a flat image (below), so undo only
  // ever removes marks the scout just made, never their earlier saved work.
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [base, setBase] = useState<HTMLImageElement | null>(null);
  const [baseSrc, setBaseSrc] = useState<string | null>(value);
  const [color, setColor] = useState<string>(PEN_COLORS[0].value);
  const drawing = useRef<Stroke | null>(null);
  // The value this pad last emitted — lets it tell "the parent loaded a
  // different team's drawing" apart from "the parent echoed back my own".
  // State rather than a ref because the render-phase sync below reads it.
  const [emitted, setEmitted] = useState<string | null>(null);
  const [lastValue, setLastValue] = useState<string | null>(value);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjusting state during render (React's alternative to a reset effect):
  // a value the pad didn't produce means a different submission loaded, so
  // start over with it as the flattened underlay.
  if (value !== lastValue) {
    setLastValue(value);
    if (value !== emitted) {
      setEmitted(value);
      setStrokes([]);
      setBase(null);
      setBaseSrc(value);
      setLoadFailed(false);
      setError(null);
    }
  }

  useEffect(() => {
    if (!baseSrc) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setBase(img);
    };
    img.onerror = () => {
      // Never fail silently here: with no underlay the pad looks blank, and
      // the next stroke would flatten onto a fresh backdrop and overwrite the
      // saved drawing. Surface it and lock the canvas instead.
      if (!cancelled) setLoadFailed(true);
    };
    img.src = baseSrc;
    return () => {
      cancelled = true;
    };
  }, [baseSrc]);

  useEffect(() => {
    redraw(canvasRef.current, base, strokes);
  }, [base, strokes]);

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    // Drawing over a drawing we failed to load would silently replace it.
    if (loadFailed) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: Stroke = { color, width: 5, points: [pointFrom(event)] };
    drawing.current = stroke;
    setStrokes((prev) => [...prev, stroke]);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const stroke = drawing.current;
    if (!stroke) return;
    stroke.points.push(pointFrom(event));
    // The in-progress stroke is mutated in place for smoothness; copy the
    // array so React still sees a new reference and repaints.
    setStrokes((prev) => [...prev]);
  }

  function commit() {
    if (!drawing.current) return;
    drawing.current = null;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = encodeCanvas(canvas);
    if (!dataUrl) {
      setError(TOO_BIG_MESSAGE);
      return;
    }
    setError(null);
    setEmitted(dataUrl);
    onChange(dataUrl);
  }

  function undo() {
    if (strokes.length === 0) return;
    const next = strokes.slice(0, -1);
    setStrokes(next);
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Paint the reduced set before reading the canvas back — state updates
    // land after this handler, so the effect hasn't repainted yet.
    redraw(canvas, base, next);
    let dataUrl: string | null = null;
    if (next.length > 0 || base) {
      dataUrl = encodeCanvas(canvas);
      if (!dataUrl) {
        setError(TOO_BIG_MESSAGE);
        return;
      }
    }
    setError(null);
    setEmitted(dataUrl);
    onChange(dataUrl);
  }

  function clear() {
    setStrokes([]);
    setBase(null);
    setBaseSrc(null);
    drawing.current = null;
    setEmitted(null);
    setLoadFailed(false);
    setError(null);
    onChange(null);
  }

  const isEmpty = strokes.length === 0 && !base;

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-graphite-700">
        {label}
        {required && (
          <span className="ml-0.5 text-maroon-600 dark:text-maroon-400">*</span>
        )}
      </span>
      {hint && <p className="text-xs text-graphite-500">{hint}</p>}

      {loadFailed && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          The saved sketch for this robot didn&apos;t load, so the pad is
          locked — drawing now would overwrite it. Reload the page, or press
          Clear to start a new one.
        </p>
      )}

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        aria-label={`${label} — drawing area`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={commit}
        onPointerCancel={commit}
        // touch-action:none keeps a drag from scrolling the page mid-stroke.
        // The aspect ratio must match the bitmap above or strokes land off
        // the fingertip; pointer coords are mapped through the rendered box.
        className="aspect-[16/9] h-auto w-full touch-none rounded-md border border-graphite-200 bg-surface"
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
          onClick={undo}
          disabled={strokes.length === 0}
          className="btn-secondary ml-auto disabled:opacity-40"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty}
          className="btn-secondary disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      {error && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {error}
        </p>
      )}
    </div>
  );
}

/** Field backdrop + every stroke, repainted from scratch. */
function redraw(
  canvas: HTMLCanvasElement | null,
  base: HTMLImageElement | null,
  strokes: readonly Stroke[],
): void {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (base) {
    ctx.drawImage(base, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  } else {
    drawFieldBackdrop(ctx);
  }

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    // A tap with no drag still leaves a dot.
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
    }
    ctx.stroke();
  }
}

/**
 * A generic FRC-shaped field: alliance zones at either end, a center line, and
 * a light grid to judge distances against. Deliberately game-agnostic — the
 * game changes every January and this shouldn't need a redraw with it.
 */
function drawFieldBackdrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let x = 60; x < CANVAS_WIDTH; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 60; y < CANVAS_HEIGHT; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  const zone = CANVAS_WIDTH * 0.16;
  ctx.fillStyle = "rgba(159, 18, 57, 0.10)";
  ctx.fillRect(0, 0, zone, CANVAS_HEIGHT);
  ctx.fillStyle = "rgba(3, 105, 161, 0.10)";
  ctx.fillRect(CANVAS_WIDTH - zone, 0, zone, CANVAS_HEIGHT);

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, CANVAS_WIDTH - 3, CANVAS_HEIGHT - 3);
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH / 2, 0);
  ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
  ctx.stroke();
}
