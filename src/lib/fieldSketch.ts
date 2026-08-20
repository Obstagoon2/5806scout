// The stroke format shared by every surface that draws on the field: the pit
// form's auto paths and the Strategy Board. Kept free of React and Firestore
// so the serializer is testable on its own (see fieldSketch.test.ts).
//
// Strokes, not flattened images. A pit scout's auto path has to be replayable
// on someone else's canvas — the Strategy Board stacks several teams' autos
// over one field at once — and a baked-in JPEG can only ever be the whole
// picture. Vectors also cost a fraction of the bytes, which matters when six
// robots' paths share one Firestore document.

/** Internal canvas resolution every sketch is authored against, so a stroke
 *  drawn on a phone replays in the same place on a laptop. Matches the field
 *  map's 600×315 (×1.6) exactly — see DrawingPad. */
export const SKETCH_WIDTH = 960;
export const SKETCH_HEIGHT = 504;

/** The field photo sketches are drawn over, served from `public/`. */
export const FIELD_MAP_SRC = "/field-map.png";

export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchStroke {
  color: string;
  width: number;
  points: SketchPoint[];
}

export const PEN_COLORS = [
  { name: "Red alliance", value: "#9f1239" },
  { name: "Blue alliance", value: "#0369a1" },
  { name: "Graphite", value: "#1f2937" },
] as const;

/** Outline painted under every stroke so pen colors survive the field photo.
 *  Near-white rather than white so it reads as an edge, not a second stroke. */
const HALO_COLOR = "#f8fafc";
const HALO_WIDTH = 4;

// --- Serialization ---------------------------------------------------------
//
// Strokes ride in a Firestore document as one string rather than as arrays of
// maps. A single path can carry several hundred points, and a map per point
// costs both the index write and roughly ten times the bytes of "x,y".
//
// Format:  color:width:x,y,x,y,…  with strokes joined by ";"
// Coordinates are rounded to whole canvas pixels — a sketch is a gesture, and
// nobody can see a third of a pixel at the size this renders.

const STROKE_SEPARATOR = ";";
const PART_SEPARATOR = ":";

/** Refuse absurd input rather than trusting a document to be well-formed. */
const MAX_POINTS_PER_STROKE = 20_000;

export function serializeStrokes(strokes: readonly SketchStroke[]): string {
  return strokes
    .filter((stroke) => stroke.points.length > 0)
    .map((stroke) => {
      const points = stroke.points
        .map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)
        .join(",");
      return `${stroke.color}${PART_SEPARATOR}${stroke.width}${PART_SEPARATOR}${points}`;
    })
    .join(STROKE_SEPARATOR);
}

/**
 * Rebuild strokes from a serialized string. Anything unparseable is dropped
 * rather than thrown: this reads documents written by other clients (and by
 * older builds), and half a strategy board beats an error boundary over the
 * whole page.
 */
export function parseStrokes(serialized: unknown): SketchStroke[] {
  if (typeof serialized !== "string" || serialized === "") return [];

  const strokes: SketchStroke[] = [];
  for (const chunk of serialized.split(STROKE_SEPARATOR)) {
    const parts = chunk.split(PART_SEPARATOR);
    if (parts.length !== 3) continue;
    const [color, rawWidth, rawPoints] = parts;
    const width = Number(rawWidth);
    if (!color || !Number.isFinite(width) || width <= 0) continue;

    const numbers = rawPoints.split(",");
    // An odd count means a truncated pair; take the points that are whole.
    const pairs = Math.min(
      Math.floor(numbers.length / 2),
      MAX_POINTS_PER_STROKE,
    );
    const points: SketchPoint[] = [];
    for (let i = 0; i < pairs; i++) {
      const x = Number(numbers[i * 2]);
      const y = Number(numbers[i * 2 + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push({ x, y });
    }
    if (points.length > 0) strokes.push({ color, width, points });
  }
  return strokes;
}

/** Recolor a set of strokes — how one team's auto is shown in its alliance's
 *  color on a board where three other paths are already drawn. */
export function recolorStrokes(
  strokes: readonly SketchStroke[],
  color: string,
): SketchStroke[] {
  return strokes.map((stroke) => ({ ...stroke, color }));
}

// --- Painting --------------------------------------------------------------

/**
 * The field backdrop: the photo when it has decoded, and a game-agnostic
 * drawn field until (or unless) it does. Never leave the canvas transparent —
 * a sketch flattened to JPEG would turn that black.
 */
export function paintField(
  ctx: CanvasRenderingContext2D,
  field: HTMLImageElement | null,
): void {
  ctx.clearRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
  if (field) {
    ctx.drawImage(field, 0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);
    return;
  }
  paintFieldBackdrop(ctx);
}

/** Every stroke, halo first and pen on top, in the order they were drawn. */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: readonly SketchStroke[],
  options: { opacity?: number } = {},
): void {
  const previousAlpha = ctx.globalAlpha;
  ctx.globalAlpha = options.opacity ?? 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    // A tap with no drag still leaves a dot.
    if (stroke.points.length === 1) {
      ctx.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y);
    }
    // The field photo has a saturated red zone at one end and a blue one at
    // the other, so an alliance-colored path drawn on its own alliance's
    // carpet would all but vanish without the outline.
    ctx.strokeStyle = HALO_COLOR;
    ctx.lineWidth = stroke.width + HALO_WIDTH;
    ctx.stroke();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.stroke();
  }

  ctx.globalAlpha = previousAlpha;
}

/**
 * Fallback for the frames before the field photo decodes, and for the case
 * where it never does: a generic FRC-shaped field with alliance zones at
 * either end, a center line, and a light grid to judge distances against.
 */
export function paintFieldBackdrop(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, SKETCH_WIDTH, SKETCH_HEIGHT);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let x = 60; x < SKETCH_WIDTH; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, SKETCH_HEIGHT);
    ctx.stroke();
  }
  for (let y = 60; y < SKETCH_HEIGHT; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(SKETCH_WIDTH, y);
    ctx.stroke();
  }

  const zone = SKETCH_WIDTH * 0.16;
  ctx.fillStyle = "rgba(159, 18, 57, 0.10)";
  ctx.fillRect(0, 0, zone, SKETCH_HEIGHT);
  ctx.fillStyle = "rgba(3, 105, 161, 0.10)";
  ctx.fillRect(SKETCH_WIDTH - zone, 0, zone, SKETCH_HEIGHT);

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, SKETCH_WIDTH - 3, SKETCH_HEIGHT - 3);
  ctx.beginPath();
  ctx.moveTo(SKETCH_WIDTH / 2, 0);
  ctx.lineTo(SKETCH_WIDTH / 2, SKETCH_HEIGHT);
  ctx.stroke();
}

// --- Hit testing -----------------------------------------------------------

/** How close a fingertip has to be to a stroke to erase it, in canvas px. */
export const ERASER_RADIUS = 14;

function distanceToSegment(
  point: SketchPoint,
  a: SketchPoint,
  b: SketchPoint,
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  // A zero-length segment is a dot; fall through to the plain point distance.
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          1,
          Math.max(
            0,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
          ),
        );
  const nearestX = a.x + t * dx;
  const nearestY = a.y + t * dy;
  return Math.hypot(point.x - nearestX, point.y - nearestY);
}

/**
 * The topmost stroke under a point, or -1 when the point is over bare field.
 *
 * Searched back to front so the eraser takes the stroke you can actually see
 * when two overlap. Whole strokes, not pixels: a scout erasing on a phone is
 * telling you "not that line", and rubbing out part of a path would leave
 * fragments nobody meant to keep.
 */
export function strokeIndexAt(
  strokes: readonly SketchStroke[],
  point: SketchPoint,
  radius: number = ERASER_RADIUS,
): number {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const { points, width } = strokes[i];
    if (points.length === 0) continue;
    const reach = radius + width / 2;
    if (points.length === 1) {
      if (Math.hypot(point.x - points[0].x, point.y - points[0].y) <= reach) {
        return i;
      }
      continue;
    }
    for (let p = 1; p < points.length; p++) {
      if (distanceToSegment(point, points[p - 1], points[p]) <= reach) {
        return i;
      }
    }
  }
  return -1;
}

// --- Alliance geometry -----------------------------------------------------
//
// A pit scout draws a robot's auto once, from wherever that robot was standing
// when they saw it. The same robot turns up on the other alliance two matches
// later, and the path has to move with it.
//
// The REBUILT field is rotationally symmetric, not mirrored — its depots sit
// diagonally opposite rather than left-right across. So the far alliance's
// equivalent of a point is the field rotated a half turn about its centre,
// NOT flipped about the centre line. Mirroring instead would put a path on the
// correct side of the field but the wrong side of it lengthwise.

/** Which half of the field a point is in. Red is the left end — see the map. */
export function allianceOfPoint(point: SketchPoint): "red" | "blue" {
  return point.x < SKETCH_WIDTH / 2 ? "red" : "blue";
}

/**
 * Which alliance a sketch was drawn for, or null when there is nothing to go
 * on. Read off the first point of the first stroke, because an auto starts at
 * its own alliance wall — the rest of the path may well cross the field, so
 * the shape as a whole is a much worse witness than where it begins.
 */
export function sketchAlliance(
  strokes: readonly SketchStroke[],
): "red" | "blue" | null {
  const first = strokes.find((stroke) => stroke.points.length > 0);
  return first ? allianceOfPoint(first.points[0]) : null;
}

/** The same path as the other alliance would run it: a half turn about the
 *  centre of the field. Applying it twice returns the original. */
export function rotateStrokes(
  strokes: readonly SketchStroke[],
): SketchStroke[] {
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((p) => ({
      x: SKETCH_WIDTH - p.x,
      y: SKETCH_HEIGHT - p.y,
    })),
  }));
}

/**
 * A scouted auto placed on the alliance the robot is actually on this match.
 * Left alone when it was already drawn on that side, and when the sketch is
 * empty — rotating nothing produces nothing, but guessing produces a lie.
 */
export function strokesForAlliance(
  strokes: readonly SketchStroke[],
  alliance: "red" | "blue",
): SketchStroke[] {
  const drawnFor = sketchAlliance(strokes);
  if (drawnFor === null || drawnFor === alliance) return [...strokes];
  return rotateStrokes(strokes);
}
