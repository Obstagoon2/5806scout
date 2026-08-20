import { describe, expect, it } from "vitest";
import type { EventMatch } from "./eventData";
import { SKETCH_HEIGHT, SKETCH_WIDTH } from "./fieldSketch";
import {
  autoSelectionKey,
  BOARD_PHASES,
  clampToField,
  defaultTokenPositions,
  emptyBoardState,
  forecastSplit,
  isPhaseId,
  isUnplayed,
  matchLabel,
  matchSlots,
  nextUpcomingMatch,
  parseBoardState,
  phaseTokens,
  phaseUsesAutos,
} from "./strategyBoard";

function match(overrides: Partial<EventMatch> = {}): EventMatch {
  return {
    key: "2026test_qm1",
    compLevel: "qm",
    matchNumber: 1,
    red: [5806, 254, 1114],
    blue: [118, 2056, 971],
    redScore: null,
    blueScore: null,
    winner: null,
    scheduledTime: null,
    ...overrides,
  };
}

describe("BOARD_PHASES", () => {
  it("runs the five phases of a match in order", () => {
    expect(BOARD_PHASES.map((p) => p.id)).toEqual([
      "auto",
      "transition",
      "active",
      "inactive",
      "endgame",
    ]);
  });

  it("offers the scouted-auto overlay on Auto alone", () => {
    expect(phaseUsesAutos("auto")).toBe(true);
    for (const phase of BOARD_PHASES.slice(1)) {
      expect(phaseUsesAutos(phase.id)).toBe(false);
    }
  });

  it("recognizes its own ids and nothing else", () => {
    expect(isPhaseId("endgame")).toBe(true);
    expect(isPhaseId("teleop")).toBe(false);
    expect(isPhaseId(undefined)).toBe(false);
  });
});

describe("nextUpcomingMatch", () => {
  it("picks the first match nobody has played", () => {
    const played = match({ matchNumber: 1, redScore: 50, blueScore: 40 });
    const next = match({ matchNumber: 2 });
    expect(nextUpcomingMatch([played, next])).toBe(next);
  });

  it("falls back to the last match once the event is over", () => {
    const first = match({ matchNumber: 1, redScore: 50, blueScore: 40 });
    const last = match({ matchNumber: 2, redScore: 10, blueScore: 20 });
    expect(nextUpcomingMatch([first, last])).toBe(last);
  });

  it("has nothing to open when no schedule is synced", () => {
    expect(nextUpcomingMatch([])).toBeNull();
  });

  it("counts a match with only one score in as played", () => {
    expect(isUnplayed(match({ redScore: 0, blueScore: null }))).toBe(false);
    expect(isUnplayed(match())).toBe(true);
  });
});

describe("matchSlots / matchLabel", () => {
  it("lists red then blue, in station order", () => {
    expect(matchSlots(match())).toEqual([
      { teamNumber: 5806, alliance: "red" },
      { teamNumber: 254, alliance: "red" },
      { teamNumber: 1114, alliance: "red" },
      { teamNumber: 118, alliance: "blue" },
      { teamNumber: 2056, alliance: "blue" },
      { teamNumber: 971, alliance: "blue" },
    ]);
  });

  it("names a match the way the schedule does", () => {
    expect(matchLabel(match({ matchNumber: 12 }))).toBe("Qual 12");
    expect(matchLabel(match({ compLevel: "sf", matchNumber: 3 }))).toBe(
      "Semifinal 3",
    );
  });

  it("shows an unfamiliar comp level rather than hiding the match", () => {
    expect(matchLabel(match({ compLevel: "ef", matchNumber: 2 }))).toBe("ef 2");
  });
});

describe("defaultTokenPositions", () => {
  it("stacks each alliance in its own end of the field", () => {
    const positions = defaultTokenPositions(match());
    expect(positions["5806"].x).toBeLessThan(SKETCH_WIDTH / 2);
    expect(positions["118"].x).toBeGreaterThan(SKETCH_WIDTH / 2);
  });

  it("gives all six robots a distinct starting spot", () => {
    const positions = defaultTokenPositions(match());
    const spots = Object.values(positions).map((p) => `${p.x},${p.y}`);
    expect(new Set(spots).size).toBe(6);
  });

  it("handles a short alliance without dropping a robot", () => {
    const positions = defaultTokenPositions(match({ red: [5806] }));
    expect(Object.keys(positions)).toHaveLength(4);
  });
});

describe("clampToField", () => {
  it("keeps a dragged marker on the field", () => {
    expect(clampToField({ x: -50, y: 10_000 })).toEqual({
      x: 0,
      y: SKETCH_HEIGHT,
    });
    expect(clampToField({ x: SKETCH_WIDTH + 5, y: -1 })).toEqual({
      x: SKETCH_WIDTH,
      y: 0,
    });
  });

  it("leaves a marker already on the field alone", () => {
    expect(clampToField({ x: 100, y: 200 })).toEqual({ x: 100, y: 200 });
  });
});

describe("parseBoardState", () => {
  it("reads a saved board back", () => {
    const parsed = parseBoardState({
      phases: {
        auto: { strokes: "#9f1239:5:1,2", tokens: { "5806": { x: 10, y: 20 } } },
      },
      selectedAutos: ["5806:a1"],
    });
    expect(parsed.phases.auto).toEqual({
      strokes: "#9f1239:5:1,2",
      tokens: { "5806": { x: 10, y: 20 } },
    });
    expect(parsed.selectedAutos).toEqual(["5806:a1"]);
  });

  it("gives every phase an entry even when the document has none", () => {
    const parsed = parseBoardState({});
    expect(Object.keys(parsed.phases).sort()).toEqual(
      BOARD_PHASES.map((p) => p.id).sort(),
    );
  });

  it("treats a missing document as an empty board", () => {
    expect(parseBoardState(undefined)).toEqual(emptyBoardState());
    expect(parseBoardState(null)).toEqual(emptyBoardState());
  });

  it("keeps the readable phases when one is malformed", () => {
    const parsed = parseBoardState({
      phases: { auto: "nonsense", endgame: { strokes: "#1f2937:5:3,4" } },
    });
    expect(parsed.phases.auto.strokes).toBe("");
    expect(parsed.phases.endgame.strokes).toBe("#1f2937:5:3,4");
  });

  it("drops markers with unusable coordinates", () => {
    const parsed = parseBoardState({
      phases: {
        auto: {
          tokens: { "5806": { x: "left", y: 2 }, "254": { x: 3, y: 4 } },
        },
      },
    });
    expect(parsed.phases.auto.tokens).toEqual({ "254": { x: 3, y: 4 } });
  });

  it("clamps a saved marker that landed off the field", () => {
    const parsed = parseBoardState({
      phases: { auto: { tokens: { "5806": { x: -20, y: 5 } } } },
    });
    expect(parsed.phases.auto.tokens["5806"].x).toBe(0);
  });

  it("ignores non-string entries in the auto selection", () => {
    const parsed = parseBoardState({ selectedAutos: ["5806:a1", 7, null] });
    expect(parsed.selectedAutos).toEqual(["5806:a1"]);
  });
});

describe("phaseTokens", () => {
  it("falls back to the starting layout for robots nobody moved", () => {
    const tokens = phaseTokens(
      { strokes: "", tokens: { "5806": { x: 400, y: 300 } } },
      match(),
    );
    expect(tokens["5806"]).toEqual({ x: 400, y: 300 });
    expect(tokens["254"]).toEqual(defaultTokenPositions(match())["254"]);
  });

  it("drops a robot that is no longer in this match", () => {
    const tokens = phaseTokens(
      { strokes: "", tokens: { "9999": { x: 10, y: 10 } } },
      match(),
    );
    expect(tokens["9999"]).toBeUndefined();
    expect(Object.keys(tokens)).toHaveLength(6);
  });
});

describe("autoSelectionKey", () => {
  it("pairs a team with one of its routines", () => {
    expect(autoSelectionKey(5806, "a1")).toBe("5806:a1");
  });
});

describe("forecastSplit", () => {
  it("splits a lopsided match to the favourite", () => {
    expect(forecastSplit(0.82)).toEqual({
      redPercent: 82,
      bluePercent: 18,
      favourite: "red",
    });
  });

  it("favours blue when the odds run the other way", () => {
    expect(forecastSplit(0.19)).toEqual({
      redPercent: 19,
      bluePercent: 81,
      favourite: "blue",
    });
  });

  it("names no favourite on a dead heat", () => {
    expect(forecastSplit(0.5)).toEqual({
      redPercent: 50,
      bluePercent: 50,
      favourite: null,
    });
  });

  it("always totals 100, even where rounding would drift", () => {
    // 0.495 rounds to 50 on its own, and so does 1 - 0.495. Rounding once and
    // subtracting is what keeps the pair honest.
    for (const p of [0.495, 0.505, 0.005, 0.334, 0.666, 0.999]) {
      const { redPercent, bluePercent } = forecastSplit(p);
      expect((redPercent ?? 0) + (bluePercent ?? 0)).toBe(100);
    }
  });

  it("has nothing to show when neither alliance can be priced", () => {
    expect(forecastSplit(null)).toEqual({
      redPercent: null,
      bluePercent: null,
      favourite: null,
    });
  });
});
