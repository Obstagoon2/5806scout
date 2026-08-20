import { describe, expect, it } from "vitest";
import {
  allianceOfPoint,
  parseStrokes,
  recolorStrokes,
  rotateStrokes,
  serializeStrokes,
  SKETCH_HEIGHT,
  SKETCH_WIDTH,
  sketchAlliance,
  strokeIndexAt,
  strokesForAlliance,
  type SketchStroke,
} from "./fieldSketch";

function stroke(overrides: Partial<SketchStroke> = {}): SketchStroke {
  return {
    color: "#9f1239",
    width: 5,
    points: [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ],
    ...overrides,
  };
}

describe("serializeStrokes / parseStrokes", () => {
  it("round-trips a sketch", () => {
    const strokes = [stroke(), stroke({ color: "#0369a1", width: 3 })];
    expect(parseStrokes(serializeStrokes(strokes))).toEqual(strokes);
  });

  it("rounds coordinates to whole canvas pixels", () => {
    const serialized = serializeStrokes([
      stroke({ points: [{ x: 10.4, y: 20.6 }] }),
    ]);
    expect(serialized).toBe("#9f1239:5:10,21");
  });

  it("drops strokes that have no points, rather than writing empties", () => {
    expect(serializeStrokes([stroke({ points: [] }), stroke()])).toBe(
      "#9f1239:5:10,20,30,40",
    );
  });

  it("serializes an empty sketch to an empty string", () => {
    expect(serializeStrokes([])).toBe("");
  });

  it("reads an empty or absent value as no strokes", () => {
    expect(parseStrokes("")).toEqual([]);
    expect(parseStrokes(undefined)).toEqual([]);
    expect(parseStrokes(null)).toEqual([]);
    expect(parseStrokes(42)).toEqual([]);
  });

  it("keeps the readable strokes when one is malformed", () => {
    const good = serializeStrokes([stroke()]);
    expect(parseStrokes(`garbage;${good}`)).toEqual([stroke()]);
  });

  it("rejects a stroke with a nonsense width instead of drawing it", () => {
    expect(parseStrokes("#9f1239:0:10,20")).toEqual([]);
    expect(parseStrokes("#9f1239:abc:10,20")).toEqual([]);
  });

  it("keeps the whole pairs when a stroke is truncated mid-point", () => {
    expect(parseStrokes("#9f1239:5:10,20,30")).toEqual([
      { color: "#9f1239", width: 5, points: [{ x: 10, y: 20 }] },
    ]);
  });

  it("survives a single-point tap", () => {
    const tap = stroke({ points: [{ x: 5, y: 5 }] });
    expect(parseStrokes(serializeStrokes([tap]))).toEqual([tap]);
  });
});

describe("recolorStrokes", () => {
  it("repaints every stroke without touching the geometry", () => {
    const recolored = recolorStrokes([stroke(), stroke()], "#0369a1");
    expect(recolored.map((s) => s.color)).toEqual(["#0369a1", "#0369a1"]);
    expect(recolored[0].points).toEqual(stroke().points);
  });

  it("leaves the originals alone", () => {
    const original = stroke();
    recolorStrokes([original], "#0369a1");
    expect(original.color).toBe("#9f1239");
  });
});

describe("strokeIndexAt", () => {
  const line: SketchStroke = {
    color: "#1f2937",
    width: 5,
    points: [
      { x: 0, y: 100 },
      { x: 200, y: 100 },
    ],
  };

  it("finds a stroke the pointer is sitting on", () => {
    expect(strokeIndexAt([line], { x: 100, y: 100 })).toBe(0);
  });

  it("finds one the pointer is merely near", () => {
    expect(strokeIndexAt([line], { x: 100, y: 108 })).toBe(0);
  });

  it("reports nothing over bare field", () => {
    expect(strokeIndexAt([line], { x: 100, y: 300 })).toBe(-1);
  });

  it("takes the topmost stroke when two overlap", () => {
    expect(strokeIndexAt([line, { ...line }], { x: 100, y: 100 })).toBe(1);
  });

  it("erases a lone tap", () => {
    const tap: SketchStroke = { color: "#1f2937", width: 5, points: [{ x: 50, y: 50 }] };
    expect(strokeIndexAt([tap], { x: 52, y: 52 })).toBe(0);
    expect(strokeIndexAt([tap], { x: 200, y: 200 })).toBe(-1);
  });

  it("stays clear of a stroke past the end of the line", () => {
    expect(strokeIndexAt([line], { x: 260, y: 100 })).toBe(-1);
  });

  it("has nothing to find on an empty board", () => {
    expect(strokeIndexAt([], { x: 10, y: 10 })).toBe(-1);
  });
});

/** A path starting at the red (left) wall and running toward centre. */
const RED_PATH: SketchStroke[] = [
  {
    color: "#9f1239",
    width: 5,
    points: [
      { x: 60, y: 120 },
      { x: 300, y: 200 },
    ],
  },
];

describe("allianceOfPoint", () => {
  it("splits the field down the middle, red on the left", () => {
    expect(allianceOfPoint({ x: 10, y: 10 })).toBe("red");
    expect(allianceOfPoint({ x: SKETCH_WIDTH - 10, y: 10 })).toBe("blue");
  });

  it("puts the centre line itself on the blue side, consistently", () => {
    expect(allianceOfPoint({ x: SKETCH_WIDTH / 2, y: 10 })).toBe("blue");
  });
});

describe("sketchAlliance", () => {
  it("reads the side off where the path starts, not where it ends", () => {
    // Starts at the red wall, finishes past the centre line.
    expect(
      sketchAlliance([
        {
          color: "#9f1239",
          width: 5,
          points: [
            { x: 40, y: 100 },
            { x: 900, y: 100 },
          ],
        },
      ]),
    ).toBe("red");
  });

  it("has no opinion about an empty sketch", () => {
    expect(sketchAlliance([])).toBeNull();
  });

  it("skips leading strokes that have no points", () => {
    expect(
      sketchAlliance([{ color: "#1f2937", width: 5, points: [] }, ...RED_PATH]),
    ).toBe("red");
  });
});

describe("rotateStrokes", () => {
  it("turns the path a half circle about the centre of the field", () => {
    expect(rotateStrokes(RED_PATH)[0].points).toEqual([
      { x: SKETCH_WIDTH - 60, y: SKETCH_HEIGHT - 120 },
      { x: SKETCH_WIDTH - 300, y: SKETCH_HEIGHT - 200 },
    ]);
  });

  it("is its own inverse", () => {
    expect(rotateStrokes(rotateStrokes(RED_PATH))).toEqual(RED_PATH);
  });

  it("keeps the pen it was drawn with", () => {
    expect(rotateStrokes(RED_PATH)[0].color).toBe(RED_PATH[0].color);
  });

  it("leaves the originals alone", () => {
    rotateStrokes(RED_PATH);
    expect(RED_PATH[0].points[0]).toEqual({ x: 60, y: 120 });
  });
});

describe("strokesForAlliance", () => {
  it("leaves a red-drawn path alone on the red alliance", () => {
    expect(strokesForAlliance(RED_PATH, "red")).toEqual(RED_PATH);
  });

  it("rotates a red-drawn path onto the blue alliance", () => {
    expect(strokesForAlliance(RED_PATH, "blue")).toEqual(
      rotateStrokes(RED_PATH),
    );
  });

  it("rotates a blue-drawn path onto the red alliance", () => {
    const bluePath = rotateStrokes(RED_PATH);
    expect(strokesForAlliance(bluePath, "red")).toEqual(RED_PATH);
  });

  it("makes nothing up out of an empty sketch", () => {
    expect(strokesForAlliance([], "blue")).toEqual([]);
  });

  it("lands every point inside the field", () => {
    for (const point of strokesForAlliance(RED_PATH, "blue")[0].points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(SKETCH_WIDTH);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(SKETCH_HEIGHT);
    }
  });
});
