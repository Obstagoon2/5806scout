import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SketchStroke } from "@/lib/fieldSketch";
import { SKETCH_WIDTH, type SketchPoint } from "@/lib/fieldSketch";
import type { BoardSlot, TokenPosition } from "@/lib/strategyBoard";
import { StrategyBoardCanvas } from "./StrategyBoardCanvas";

// jsdom has no canvas backend, so getContext() returns null and the painting
// effects no-op. Everything asserted here is the interaction layer — markers,
// the eraser, what gets emitted — which is where the wiring bugs live.

const SLOTS: BoardSlot[] = [
  { teamNumber: 5806, alliance: "red" },
  { teamNumber: 254, alliance: "red" },
  { teamNumber: 118, alliance: "blue" },
];

const TOKENS: Record<string, TokenPosition> = {
  "5806": { x: 100, y: 100 },
  "254": { x: 100, y: 200 },
  "118": { x: 800, y: 100 },
};

const LINE: SketchStroke = {
  color: "#1f2937",
  width: 6,
  points: [
    { x: 0, y: 100 },
    { x: 200, y: 100 },
  ],
};

type BoardProps = React.ComponentProps<typeof StrategyBoardCanvas>;

function setup(overrides: Partial<BoardProps> = {}) {
  // Held separately from the props object so they keep their Mock type after
  // the spread — `.mock.calls` is how several of these assert.
  const onStrokesChange = vi.fn();
  const onCommit = vi.fn();
  const onTokenMove = vi.fn();
  const props: BoardProps = {
    strokes: [] as SketchStroke[],
    onStrokesChange,
    onCommit,
    tokens: TOKENS,
    onTokenMove,
    slots: SLOTS,
    overlays: [],
    tool: "pen",
    color: "#9f1239",
    ...overrides,
  };
  render(<StrategyBoardCanvas {...props} />);
  return { onStrokesChange, onCommit, onTokenMove };
}

describe("StrategyBoardCanvas", () => {
  it("puts a marker on the field for every robot in the match", () => {
    setup();
    for (const slot of SLOTS) {
      expect(
        screen.getByRole("button", {
          name: new RegExp(`robot ${slot.teamNumber}`),
        }),
      ).toBeTruthy();
    }
  });

  it("names each marker's alliance, so the label isn't carried by color alone", () => {
    setup();
    expect(
      screen.getByRole("button", { name: /blue alliance robot 118/ }),
    ).toBeTruthy();
  });

  it("leaves out a robot the board has no position for", () => {
    setup({ tokens: { "5806": { x: 10, y: 10 } } });
    expect(screen.queryByRole("button", { name: /robot 254/ })).toBeNull();
  });

  it("nudges a marker with the arrow keys and saves the move", async () => {
    const user = userEvent.setup();
    const props = setup();

    const token = screen.getByRole("button", { name: /robot 5806/ });
    token.focus();
    await user.keyboard("{ArrowRight}");

    expect(props.onTokenMove).toHaveBeenCalledWith(5806, { x: 110, y: 100 });
    expect(props.onCommit).toHaveBeenCalled();
  });

  it("takes a bigger step with shift held", async () => {
    const user = userEvent.setup();
    const props = setup();

    screen.getByRole("button", { name: /robot 5806/ }).focus();
    await user.keyboard("{Shift>}{ArrowDown}{/Shift}");

    expect(props.onTokenMove).toHaveBeenCalledWith(5806, { x: 100, y: 140 });
  });

  it("keeps a nudged marker on the field instead of off the edge", async () => {
    const user = userEvent.setup();
    const props = setup({ tokens: { "118": { x: SKETCH_WIDTH, y: 100 } } });

    screen.getByRole("button", { name: /robot 118/ }).focus();
    await user.keyboard("{ArrowRight}");

    expect(props.onTokenMove).toHaveBeenCalledWith(118, {
      x: SKETCH_WIDTH,
      y: 100,
    });
  });

  it("ignores keys that aren't a direction", async () => {
    const user = userEvent.setup();
    const props = setup();

    screen.getByRole("button", { name: /robot 5806/ }).focus();
    await user.keyboard("a");

    expect(props.onTokenMove).not.toHaveBeenCalled();
  });
});

describe("StrategyBoardCanvas eraser", () => {
  /** jsdom gives every element a zero-size rect, so pointer coordinates have
   *  to be mapped through a stubbed one to land anywhere meaningful. */
  function stubCanvasRect(canvas: HTMLElement) {
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: SKETCH_WIDTH,
      height: 504,
      right: SKETCH_WIDTH,
      bottom: 504,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
  }

  function pointerAt(
    canvas: HTMLElement,
    type: "pointerdown" | "pointermove" | "pointerup",
    point: SketchPoint,
  ) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        clientX: point.x,
        clientY: point.y,
      }),
    );
  }

  function pointerDownAt(canvas: HTMLElement, point: SketchPoint) {
    pointerAt(canvas, "pointerdown", point);
  }

  it("removes the stroke under the pointer", () => {
    const props = setup({ strokes: [LINE], tool: "eraser" });
    const canvas = screen.getByLabelText("Strategy board field");
    stubCanvasRect(canvas);

    pointerDownAt(canvas, { x: 100, y: 100 });

    expect(props.onStrokesChange).toHaveBeenCalledWith([]);
    expect(props.onCommit).toHaveBeenCalled();
  });

  it("does nothing when the pointer is over bare field", () => {
    const props = setup({ strokes: [LINE], tool: "eraser" });
    const canvas = screen.getByLabelText("Strategy board field");
    stubCanvasRect(canvas);

    pointerDownAt(canvas, { x: 500, y: 400 });

    expect(props.onStrokesChange).not.toHaveBeenCalled();
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("draws with the pen instead of erasing what is under the pointer", () => {
    const props = setup({ strokes: [LINE], tool: "pen", color: "#0369a1" });
    const canvas = screen.getByLabelText("Strategy board field");
    stubCanvasRect(canvas);
    // setPointerCapture is not implemented in jsdom.
    canvas.setPointerCapture = vi.fn();

    pointerDownAt(canvas, { x: 100, y: 100 });
    pointerAt(canvas, "pointerup", { x: 100, y: 100 });

    const emitted = props.onStrokesChange.mock.calls[0][0] as SketchStroke[];
    expect(emitted).toHaveLength(2);
    expect(emitted[1].color).toBe("#0369a1");
  });
});

describe("StrategyBoardCanvas drawing", () => {
  function stubbedCanvas() {
    const canvas = screen.getByLabelText("Strategy board field");
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: SKETCH_WIDTH,
      height: 504,
      right: SKETCH_WIDTH,
      bottom: 504,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    canvas.setPointerCapture = vi.fn();
    return canvas;
  }

  function drag(canvas: HTMLElement, points: SketchPoint[]) {
    const fire = (type: string, p: SketchPoint) =>
      canvas.dispatchEvent(
        new PointerEvent(type, { bubbles: true, clientX: p.x, clientY: p.y }),
      );
    fire("pointerdown", points[0]);
    for (const point of points.slice(1)) fire("pointermove", point);
    fire("pointerup", points[points.length - 1]);
  }

  /**
   * The regression this file exists for: the board round-trips `strokes`
   * through serialization, so a stroke handed up mid-drag comes back as a
   * different object. Appending to the original then landed nowhere and every
   * drag left a single dot.
   */
  it("keeps every point of a drag, not just where it started", () => {
    const props = setup();
    const canvas = stubbedCanvas();

    drag(canvas, [
      { x: 10, y: 10 },
      { x: 50, y: 40 },
      { x: 90, y: 80 },
    ]);

    expect(props.onStrokesChange).toHaveBeenCalledTimes(1);
    const emitted = props.onStrokesChange.mock.calls[0][0] as SketchStroke[];
    expect(emitted).toHaveLength(1);
    expect(emitted[0].points).toEqual([
      { x: 10, y: 10 },
      { x: 50, y: 40 },
      { x: 90, y: 80 },
    ]);
  });

  it("appends to what was already on the board", () => {
    const props = setup({ strokes: [LINE] });
    drag(stubbedCanvas(), [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
    ]);

    const emitted = props.onStrokesChange.mock.calls[0][0] as SketchStroke[];
    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toEqual(LINE);
  });

  it("saves once per finished stroke, not per pointer move", () => {
    const props = setup();
    drag(stubbedCanvas(), [
      { x: 10, y: 10 },
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);

    expect(props.onCommit).toHaveBeenCalledTimes(1);
  });

  it("keeps a tap with no drag, which marks a spot", () => {
    const props = setup();
    const canvas = stubbedCanvas();
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: 5, clientY: 5 }),
    );
    canvas.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, clientX: 5, clientY: 5 }),
    );

    const emitted = props.onStrokesChange.mock.calls[0][0] as SketchStroke[];
    expect(emitted[0].points).toEqual([{ x: 5, y: 5 }]);
  });

  it("emits nothing when a move arrives with no stroke in progress", () => {
    const props = setup();
    stubbedCanvas().dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, clientX: 5, clientY: 5 }),
    );
    expect(props.onStrokesChange).not.toHaveBeenCalled();
  });
});
