"use client";

import {
  SKETCH_CANVAS_CLASS,
  sketchPointFrom,
  useFieldImage,
} from "@/components/FieldSketchPad";
import {
  paintField,
  paintStrokes,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  strokeIndexAt,
  type SketchStroke,
} from "@/lib/fieldSketch";
import {
  ALLIANCE_COLORS,
  clampToField,
  type BoardSlot,
  type TokenPosition,
} from "@/lib/strategyBoard";
import { useEffect, useRef, useState } from "react";

// The board itself: a field you draw on, with six draggable robot markers over
// it and any number of read-only auto paths laid underneath.
//
// Markers are DOM buttons rather than shapes painted on the canvas. Painting
// them would mean hit-testing every drag against the same surface the pen
// writes to, and it would leave a team number no screen reader could read.
// They are composited back onto the canvas only when exporting (see
// exportBoardImage).

export type BoardTool = "pen" | "eraser";

/** A scouted auto laid under the board's own strokes. */
export interface BoardOverlay {
  key: string;
  strokes: SketchStroke[];
}

/** Overlays sit under the pen at reduced strength — they're reference, not
 *  the plan being drawn. */
const OVERLAY_OPACITY = 0.75;

const PEN_WIDTH = 6;
/** Markers are squares — a robot has a frame perimeter, and a square reads as
 *  one you can line up against a field element in a way a disc does not. */
const TOKEN_SIZE = 46;
const TOKEN_RADIUS = 6;

interface StrategyBoardCanvasProps {
  strokes: readonly SketchStroke[];
  onStrokesChange: (strokes: SketchStroke[]) => void;
  /** Committed once per gesture — a stroke finished, a marker dropped. */
  onCommit: () => void;
  tokens: Record<string, TokenPosition>;
  onTokenMove: (teamNumber: number, position: TokenPosition) => void;
  slots: readonly BoardSlot[];
  overlays: readonly BoardOverlay[];
  tool: BoardTool;
  color: string;
}

export function StrategyBoardCanvas({
  strokes,
  onStrokesChange,
  onCommit,
  tokens,
  onTokenMove,
  slots,
  overlays,
  tool,
  color,
}: StrategyBoardCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const field = useFieldImage();
  // The stroke under the finger, held here until it is finished.
  //
  // It cannot live in `strokes`: the board round-trips that prop through
  // serialization on every change, so a stroke handed up mid-gesture comes
  // back as a different object, and the points appended to the original land
  // nowhere. Every drag used to leave a single dot. Emitting once, on
  // pointer-up, also stops the whole board re-serializing per pointer move.
  //
  // Kept in both a ref and state: the ref is what the handlers read and write,
  // because pointermove is a continuous event React may batch and a stale
  // closure would silently drop points. The state exists only to trigger the
  // repaint, so the line appears under the finger as it is drawn.
  const liveRef = useRef<SketchStroke | null>(null);
  const [liveStroke, setLiveStroke] = useState<SketchStroke | null>(null);

  function setLive(stroke: SketchStroke | null) {
    liveRef.current = stroke;
    setLiveStroke(stroke);
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    paintField(ctx, field);
    for (const overlay of overlays) {
      paintStrokes(ctx, overlay.strokes, { opacity: OVERLAY_OPACITY });
    }
    paintStrokes(ctx, liveStroke ? [...strokes, liveStroke] : strokes);
  }, [field, liveStroke, overlays, strokes]);

  function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const point = sketchPointFrom(event);

    if (tool === "eraser") {
      const index = strokeIndexAt(strokes, point);
      // Overlays aren't erasable here — they belong to the pit scout who drew
      // them. Untick the auto to take one off the board.
      if (index === -1) return;
      onStrokesChange(strokes.filter((_, i) => i !== index));
      onCommit();
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setLive({ color, width: PEN_WIDTH, points: [point] });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = liveRef.current;
    if (!current) return;
    const point = sketchPointFrom(event);
    setLive({ ...current, points: [...current.points, point] });
  }

  function handlePointerUp() {
    const finished = liveRef.current;
    if (!finished) return;
    setLive(null);
    // A tap with no drag is a dot, and worth keeping — it marks a spot.
    onStrokesChange([...strokes, finished]);
    onCommit();
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={SKETCH_WIDTH}
        height={SKETCH_HEIGHT}
        data-strategy-board-canvas
        aria-label="Strategy board field"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`${SKETCH_CANVAS_CLASS} ${
          tool === "eraser" ? "cursor-cell" : "cursor-crosshair"
        }`}
      />
      {slots.map((slot) => (
        <TeamToken
          key={slot.teamNumber}
          slot={slot}
          position={tokens[String(slot.teamNumber)]}
          onMove={(position) => onTokenMove(slot.teamNumber, position)}
          onCommit={onCommit}
        />
      ))}
    </div>
  );
}

/**
 * One robot on the field. Drag it with a finger or a mouse; nudge it with the
 * arrow keys once focused, which is the only way to place a marker precisely
 * and the only way to place one at all without a pointer.
 */
function TeamToken({
  slot,
  position,
  onMove,
  onCommit,
}: {
  slot: BoardSlot;
  position: TokenPosition | undefined;
  onMove: (position: TokenPosition) => void;
  onCommit: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  if (!position) return null;

  // Percentages, so the marker tracks the canvas as it scales to its column.
  const left = `${(position.x / SKETCH_WIDTH) * 100}%`;
  const top = `${(position.y / SKETCH_HEIGHT) * 100}%`;

  function pointFrom(event: React.PointerEvent<HTMLButtonElement>) {
    const board = event.currentTarget.parentElement;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    return clampToField({
      x: ((event.clientX - rect.left) / rect.width) * SKETCH_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * SKETCH_HEIGHT,
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 40 : 10;
    const deltas: Record<string, TokenPosition> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = deltas[event.key];
    if (!delta || !position) return;
    event.preventDefault();
    onMove(clampToField({ x: position.x + delta.x, y: position.y + delta.y }));
    onCommit();
  }

  return (
    <button
      type="button"
      aria-label={`${slot.alliance} alliance robot ${slot.teamNumber} — drag to move, or use the arrow keys`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (!dragging) return;
        const next = pointFrom(event);
        if (next) onMove(next);
      }}
      onPointerUp={() => {
        if (!dragging) return;
        setDragging(false);
        onCommit();
      }}
      onPointerCancel={() => setDragging(false)}
      onKeyDown={handleKeyDown}
      style={{
        left,
        top,
        width: TOKEN_SIZE,
        height: TOKEN_SIZE,
        backgroundColor: ALLIANCE_COLORS[slot.alliance],
      }}
      className={`stat absolute -translate-x-1/2 -translate-y-1/2 touch-none rounded-md border-2 border-white text-xs font-semibold text-white transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-graphite-900 dark:focus-visible:ring-graphite-100 ${
        dragging ? "cursor-grabbing" : "cursor-grab"
      }`}
    >
      {slot.teamNumber}
    </button>
  );
}

/**
 * Flatten the board — field, overlays, strokes and markers — into a PNG data
 * URL. The markers live in the DOM, so they're painted here rather than
 * captured; anything else would need a screenshot API the browser won't give
 * a page about itself.
 */
export function exportBoardImage(
  field: HTMLImageElement | null,
  strokes: readonly SketchStroke[],
  overlays: readonly BoardOverlay[],
  tokens: Record<string, TokenPosition>,
  slots: readonly BoardSlot[],
): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SKETCH_WIDTH;
  canvas.height = SKETCH_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  paintField(ctx, field);
  for (const overlay of overlays) {
    paintStrokes(ctx, overlay.strokes, { opacity: OVERLAY_OPACITY });
  }
  paintStrokes(ctx, strokes);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "600 18px ui-monospace, SFMono-Regular, monospace";
  for (const slot of slots) {
    const position = tokens[String(slot.teamNumber)];
    if (!position) continue;
    // Same rounded square the DOM marker draws, so an exported board looks
    // like the one on screen.
    ctx.beginPath();
    const x = position.x - TOKEN_SIZE / 2;
    const y = position.y - TOKEN_SIZE / 2;
    // roundRect is recent and the pits are full of old tablets; a square
    // corner is a fine marker, a thrown export is not.
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, TOKEN_SIZE, TOKEN_SIZE, TOKEN_RADIUS);
    } else {
      ctx.rect(x, y, TOKEN_SIZE, TOKEN_SIZE);
    }
    ctx.fillStyle = ALLIANCE_COLORS[slot.alliance];
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(String(slot.teamNumber), position.x, position.y);
  }

  return canvas.toDataURL("image/png");
}
