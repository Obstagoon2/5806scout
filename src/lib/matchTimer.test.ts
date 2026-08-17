import { describe, expect, it } from "vitest";
import {
  formatClock,
  IDLE_CLOCK,
  isRunning,
  pauseMatch,
  shiftAt,
  startMatch,
  TELEOP_SECONDS,
  toggleDefense,
  toggleMatch,
  watchSeconds,
} from "./matchTimer";

const T0 = 1_700_000_000_000;
const at = (seconds: number) => T0 + seconds * 1000;

describe("formatClock", () => {
  it("reads like the arena timer", () => {
    expect(formatClock(TELEOP_SECONDS)).toBe("2:20");
    expect(formatClock(7)).toBe("0:07");
    expect(formatClock(0)).toBe("0:00");
  });

  it("never shows negative time", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("shiftAt", () => {
  it("names the shift the match is in", () => {
    expect(shiftAt(0)).toBe("Transition");
    expect(shiftAt(9)).toBe("Transition");
    expect(shiftAt(10)).toBe("Shift 1");
    expect(shiftAt(84)).toBe("Shift 3");
    expect(shiftAt(85)).toBe("Shift 4");
    expect(shiftAt(110)).toBe("End game");
  });

  it("stops naming shifts once teleop is over", () => {
    expect(shiftAt(TELEOP_SECONDS)).toBe("Match over");
  });
});

describe("match clock", () => {
  it("counts only while running", () => {
    const started = startMatch(IDLE_CLOCK, at(0));
    expect(isRunning(started.match)).toBe(true);
    expect(watchSeconds(started.match, at(30))).toBe(30);

    const paused = pauseMatch(started, at(30));
    expect(isRunning(paused.match)).toBe(false);
    // Ten seconds of wall clock pass while paused; the total holds.
    expect(watchSeconds(paused.match, at(40))).toBe(30);
  });

  it("banks time across a pause and resume", () => {
    let clock = startMatch(IDLE_CLOCK, at(0));
    clock = pauseMatch(clock, at(20));
    clock = startMatch(clock, at(50));
    expect(watchSeconds(clock.match, at(60))).toBe(30);
  });

  it("toggles between running and paused", () => {
    const running = toggleMatch(IDLE_CLOCK, at(0));
    expect(isRunning(running.match)).toBe(true);
    expect(isRunning(toggleMatch(running, at(5)).match)).toBe(false);
  });

  it("ignores a clock that jumps backwards", () => {
    const started = startMatch(IDLE_CLOCK, at(10));
    expect(watchSeconds(started.match, at(5))).toBe(0);
  });
});

describe("defense stopwatches", () => {
  it("times a stretch of defense within a running match", () => {
    let clock = startMatch(IDLE_CLOCK, at(0));
    clock = toggleDefense(clock, "played", at(10));
    clock = toggleDefense(clock, "played", at(40));
    expect(watchSeconds(clock.played, at(90))).toBe(30);
    expect(clock.armed.played).toBe(false);
  });

  it("keeps the two stopwatches independent", () => {
    let clock = startMatch(IDLE_CLOCK, at(0));
    clock = toggleDefense(clock, "played", at(0));
    clock = toggleDefense(clock, "against", at(20));
    expect(watchSeconds(clock.played, at(50))).toBe(50);
    expect(watchSeconds(clock.against, at(50))).toBe(30);
  });

  it("does not run before the match is started", () => {
    // A scout who arms defense early shouldn't bank pre-match seconds.
    let clock = toggleDefense(IDLE_CLOCK, "played", at(0));
    expect(clock.armed.played).toBe(true);
    expect(watchSeconds(clock.played, at(30))).toBe(0);

    clock = startMatch(clock, at(30));
    expect(watchSeconds(clock.played, at(45))).toBe(15);
  });

  it("parks an armed stopwatch while the match is paused, then resumes it", () => {
    let clock = startMatch(IDLE_CLOCK, at(0));
    clock = toggleDefense(clock, "played", at(0));
    clock = pauseMatch(clock, at(10));
    // Still held down — the pause must not disarm it.
    expect(clock.armed.played).toBe(true);
    expect(watchSeconds(clock.played, at(60))).toBe(10);

    clock = startMatch(clock, at(60));
    expect(watchSeconds(clock.played, at(70))).toBe(20);
  });

  it("stops an armed stopwatch when defense is disarmed mid-pause", () => {
    let clock = startMatch(IDLE_CLOCK, at(0));
    clock = toggleDefense(clock, "played", at(0));
    clock = pauseMatch(clock, at(10));
    clock = toggleDefense(clock, "played", at(30));
    expect(clock.armed.played).toBe(false);

    clock = startMatch(clock, at(40));
    expect(watchSeconds(clock.played, at(90))).toBe(10);
  });

  it("reads zero on an untouched clock", () => {
    expect(watchSeconds(IDLE_CLOCK.played, at(120))).toBe(0);
    expect(watchSeconds(IDLE_CLOCK.against, at(120))).toBe(0);
  });
});
