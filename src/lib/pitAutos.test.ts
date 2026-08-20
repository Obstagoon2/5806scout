import { describe, expect, it } from "vitest";
import type { SketchStroke } from "./fieldSketch";
import {
  autoDisplayName,
  isBlankAuto,
  MAX_AUTOS_PER_ROBOT,
  parseAutoPaths,
  parseAutos,
  removedAutoIds,
  splitAutos,
  withPaths,
  type PitAutoWithPath,
} from "./pitAutos";

const PATH: SketchStroke[] = [
  { color: "#1f2937", width: 5, points: [{ x: 1, y: 2 }] },
];

function auto(overrides: Partial<PitAutoWithPath> = {}): PitAutoWithPath {
  return {
    id: "a1",
    name: "3-piece left",
    notes: "Starts on the wall",
    strokes: [],
    ...overrides,
  };
}

describe("parseAutos", () => {
  it("reads a well-formed list", () => {
    expect(parseAutos([{ id: "a1", name: "Taxi", notes: "n" }])).toEqual([
      { id: "a1", name: "Taxi", notes: "n" },
    ]);
  });

  it("treats a missing or non-array field as no autos", () => {
    expect(parseAutos(undefined)).toEqual([]);
    expect(parseAutos(null)).toEqual([]);
    expect(parseAutos("autos")).toEqual([]);
  });

  it("skips entries with no usable id rather than inventing one", () => {
    expect(
      parseAutos([{ name: "no id" }, { id: "" }, null, { id: "a2" }]),
    ).toEqual([{ id: "a2", name: "", notes: "" }]);
  });

  it("defaults missing text to empty strings", () => {
    expect(parseAutos([{ id: "a1", name: 7, notes: null }])).toEqual([
      { id: "a1", name: "", notes: "" },
    ]);
  });

  it("stops at the per-robot cap", () => {
    const many = Array.from({ length: MAX_AUTOS_PER_ROBOT + 5 }, (_, i) => ({
      id: `a${i}`,
      name: "",
      notes: "",
    }));
    expect(parseAutos(many)).toHaveLength(MAX_AUTOS_PER_ROBOT);
  });
});

describe("parseAutoPaths", () => {
  it("keeps only string values", () => {
    expect(parseAutoPaths({ a1: "#1f2937:5:1,2", a2: 7, a3: null })).toEqual({
      a1: "#1f2937:5:1,2",
    });
  });

  it("treats a missing map as no paths", () => {
    expect(parseAutoPaths(undefined)).toEqual({});
    expect(parseAutoPaths(null)).toEqual({});
  });
});

describe("withPaths / splitAutos", () => {
  it("round-trips names, notes and paths across the two documents", () => {
    const autos = [auto({ strokes: PATH }), auto({ id: "a2", name: "Taxi" })];
    const { core, paths } = splitAutos(autos);
    expect(withPaths(core, paths)).toEqual(autos);
  });

  it("writes an empty path for an auto whose sketch was erased, so the merge clears it", () => {
    const { paths } = splitAutos([auto()]);
    expect(paths).toEqual({ a1: "" });
  });

  it("gives an auto with no saved path an empty stroke list", () => {
    expect(withPaths([{ id: "a1", name: "", notes: "" }], {})[0].strokes).toEqual(
      [],
    );
  });
});

describe("removedAutoIds", () => {
  it("names the paths left behind by a deleted auto", () => {
    expect(removedAutoIds(["a1", "a2", "a3"], [auto({ id: "a2" })])).toEqual([
      "a1",
      "a3",
    ]);
  });

  it("is empty when nothing was removed", () => {
    expect(removedAutoIds(["a1"], [auto()])).toEqual([]);
  });

  it("ignores autos that were added since loading", () => {
    expect(removedAutoIds([], [auto(), auto({ id: "a2" })])).toEqual([]);
  });
});

describe("isBlankAuto", () => {
  it("calls a row the scout never filled in blank", () => {
    expect(isBlankAuto(auto({ name: "  ", notes: "" }))).toBe(true);
  });

  it("keeps an auto that has only a drawn path", () => {
    expect(isBlankAuto(auto({ name: "", notes: "", strokes: PATH }))).toBe(
      false,
    );
  });

  it("keeps an auto that has only notes", () => {
    expect(isBlankAuto(auto({ name: "", notes: "Scores two" }))).toBe(false);
  });
});

describe("autoDisplayName", () => {
  it("uses the typed name", () => {
    expect(autoDisplayName(auto(), 0)).toBe("3-piece left");
  });

  it("falls back to a numbered label when unnamed", () => {
    expect(autoDisplayName(auto({ name: "   " }), 2)).toBe("Auto 3");
  });
});
