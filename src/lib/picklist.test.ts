import { describe, expect, it } from "vitest";
import type { EventTeam } from "./eventData";
import { moveItem, reconcileOrder, toggleStruck } from "./picklist";

function team(teamNumber: number, epa: number | null): EventTeam {
  return { teamNumber, nickname: String(teamNumber), city: "", epa, epaRank: null };
}

describe("reconcileOrder", () => {
  const eventTeams = [team(111, 30), team(222, 90), team(333, null), team(444, 60)];

  it("keeps saved order for teams still present", () => {
    expect(reconcileOrder([444, 111], eventTeams)).toEqual([444, 111, 222, 333]);
  });

  it("appends new teams sorted by EPA desc, null EPA last", () => {
    expect(reconcileOrder([], eventTeams)).toEqual([222, 444, 111, 333]);
  });

  it("drops saved teams that left the event", () => {
    expect(reconcileOrder([999, 222, 111, 444, 333], eventTeams)).toEqual([
      222, 111, 444, 333,
    ]);
  });
});

describe("moveItem", () => {
  it("moves an item down", () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
  });

  it("moves an item up", () => {
    expect(moveItem([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
  });

  it("returns a copy when indices are out of range", () => {
    expect(moveItem([1, 2], 5, 0)).toEqual([1, 2]);
  });
});

describe("toggleStruck", () => {
  it("adds when absent and removes when present", () => {
    expect(toggleStruck([], 254)).toEqual([254]);
    expect(toggleStruck([254, 111], 254)).toEqual([111]);
  });
});
