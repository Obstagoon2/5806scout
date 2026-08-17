import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NexusPitMap } from "./NexusPitMap";
import { mapPitMap } from "@/lib/nexus";

function pitMap(pits: Record<string, { team?: string | null }>) {
  return mapPitMap({
    size: { x: 400, y: 400 },
    pits: Object.fromEntries(
      Object.entries(pits).map(([address, pit], i) => [
        address,
        {
          position: { x: 50 + i * 110, y: 50 },
          size: { x: 100, y: 100 },
          ...pit,
        },
      ]),
    ),
  });
}

describe("NexusPitMap", () => {
  it("puts the team number in the box", () => {
    render(
      <NexusPitMap map={pitMap({ A1: { team: "5806" } })} highlightTeam={null} />,
    );

    expect(screen.getByText("5806")).toBeTruthy();
  });

  it("shows the pit address alongside the team", () => {
    render(
      <NexusPitMap map={pitMap({ C14: { team: "254" } })} highlightTeam={null} />,
    );

    expect(screen.getByText("254")).toBeTruthy();
    expect(screen.getByText("C14")).toBeTruthy();
  });

  it("falls back to the address when no team is assigned", () => {
    // The common case before an event publishes pit assignments — these boxes
    // used to render completely blank.
    render(<NexusPitMap map={pitMap({ A1: {}, A2: {} })} highlightTeam={null} />);

    expect(screen.getByText("A1")).toBeTruthy();
    expect(screen.getByText("A2")).toBeTruthy();
  });

  it("labels our own pit for the screen reader when highlighted", () => {
    render(
      <NexusPitMap
        map={pitMap({ A1: { team: "5806" } })}
        highlightTeam="5806"
      />,
    );

    expect(
      screen.getByRole("img", { name: /Team 5806's pit is highlighted/ }),
    ).toBeTruthy();
  });

  it("renders nothing for a map with no dimensions", () => {
    const { container } = render(
      <NexusPitMap
        map={{
          width: 0,
          height: 0,
          pits: [],
          areas: [],
          labels: [],
          walls: [],
          arrows: [],
        }}
        highlightTeam={null}
      />,
    );

    expect(container.querySelector("svg")).toBeNull();
  });
});
