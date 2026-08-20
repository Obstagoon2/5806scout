import { describe, expect, it } from "vitest";
import {
  parseStrokes,
  recolorStrokes,
  serializeStrokes,
  strokeIndexAt,
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
