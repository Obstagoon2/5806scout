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

function setup(overrides: Partial<React.ComponentProps<typeof StrategyBoardCanvas>> = {}) {
  const props = {
    strokes: [] as SketchStroke[],
    onStrokesChange: vi.fn(),
    onCommit: vi.fn(),
    tokens: TOKENS,
    onTokenMove: vi.fn(),
    slots: SLOTS,
    overlays: [],
    tool: "pen" as const,
    color: "#9f1239",
    ...overrides,
  };
  render(<StrategyBoardCanvas {...props} />);
  return props;
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

  function pointerDownAt(canvas: HTMLElement, point: SketchPoint) {
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: point.x,
        clientY: point.y,
      }),
    );
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

  it("starts a new stroke with the pen instead of erasing", () => {
    const props = setup({ strokes: [LINE], tool: "pen", color: "#0369a1" });
    const canvas = screen.getByLabelText("Strategy board field");
    stubCanvasRect(canvas);
    // setPointerCapture is not implemented in jsdom.
    canvas.setPointerCapture = vi.fn();

    pointerDownAt(canvas, { x: 100, y: 100 });

    const emitted = props.onStrokesChange.mock.calls[0][0] as SketchStroke[];
    expect(emitted).toHaveLength(2);
    expect(emitted[1].color).toBe("#0369a1");
  });
});
