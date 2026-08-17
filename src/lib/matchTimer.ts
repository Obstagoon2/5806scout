// Match clock + defense stopwatches for the Match Scout screen.
//
// REBUILT (2026) teleop runs 2:20 down to 0:00, split into a 10-second
// transition, four 25-second alliance shifts, and a 30-second end game
// (manual Table 6-2). The scout's clock counts the same direction as the
// arena timer so a glance up matches what's on screen.
//
// Defense used to be a judgment call ("part of match" / "most of match").
// It's timed instead: the scout arms a stopwatch when defense starts and
// disarms it when it stops, and the seconds land in the submission. The
// stopwatches only run while the match clock does, so a paused match (field
// fault, timeout) never inflates a defense total.
//
// Everything here derives elapsed time from wall-clock timestamps rather than
// accumulating ticks: a phone that throttles timers in a backgrounded tab
// would silently under-count an accumulator, and scouts do put the phone down.

/** Teleop length in seconds — 2:20 on the arena timer. */
export const TELEOP_SECONDS = 140;

/** Teleop shifts, as seconds elapsed at which each one begins. */
export const TELEOP_SHIFTS: readonly { label: string; startsAt: number }[] = [
  { label: "Transition", startsAt: 0 },
  { label: "Shift 1", startsAt: 10 },
  { label: "Shift 2", startsAt: 35 },
  { label: "Shift 3", startsAt: 60 },
  { label: "Shift 4", startsAt: 85 },
  { label: "End game", startsAt: 110 },
];

/**
 * Which shift the match is in. Worth showing: only one alliance's HUB scores
 * during a given shift, so "when" defense happened is the strategic half of
 * "how long".
 */
export function shiftAt(elapsedSeconds: number): string {
  if (elapsedSeconds >= TELEOP_SECONDS) return "Match over";
  let label = TELEOP_SHIFTS[0].label;
  for (const shift of TELEOP_SHIFTS) {
    if (elapsedSeconds >= shift.startsAt) label = shift.label;
  }
  return label;
}

/** Seconds as the arena shows them — "2:20", "0:07". */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/** A stopwatch that survives pause/resume without drifting. */
export interface Stopwatch {
  /** Milliseconds banked by earlier runs. */
  baseMs: number;
  /** When the current run started, or null if stopped. */
  startedAtMs: number | null;
}

export const IDLE_STOPWATCH: Stopwatch = { baseMs: 0, startedAtMs: null };

export function isRunning(watch: Stopwatch): boolean {
  return watch.startedAtMs !== null;
}

export function watchMs(watch: Stopwatch, nowMs: number): number {
  if (watch.startedAtMs === null) return watch.baseMs;
  // A clock that jumped backwards must never subtract banked time.
  return watch.baseMs + Math.max(0, nowMs - watch.startedAtMs);
}

/** Whole seconds on a stopwatch — the granularity submissions record. */
export function watchSeconds(watch: Stopwatch, nowMs: number): number {
  return Math.round(watchMs(watch, nowMs) / 1000);
}

function start(watch: Stopwatch, nowMs: number): Stopwatch {
  return watch.startedAtMs === null
    ? { baseMs: watch.baseMs, startedAtMs: nowMs }
    : watch;
}

function stop(watch: Stopwatch, nowMs: number): Stopwatch {
  return watch.startedAtMs === null
    ? watch
    : { baseMs: watchMs(watch, nowMs), startedAtMs: null };
}

/** Which stopwatch a defense toggle drives. */
export type DefenseKind = "played" | "against";

export interface MatchClock {
  match: Stopwatch;
  played: Stopwatch;
  against: Stopwatch;
  /**
   * Whether each defense toggle is held down, tracked apart from whether its
   * stopwatch is running: pausing the match parks an armed stopwatch without
   * disarming it, so resuming picks the defense back up rather than quietly
   * dropping it on the floor.
   */
  armed: Record<DefenseKind, boolean>;
}

export const IDLE_CLOCK: MatchClock = {
  match: IDLE_STOPWATCH,
  played: IDLE_STOPWATCH,
  against: IDLE_STOPWATCH,
  armed: { played: false, against: false },
};

export function startMatch(clock: MatchClock, nowMs: number): MatchClock {
  return {
    ...clock,
    match: start(clock.match, nowMs),
    played: clock.armed.played ? start(clock.played, nowMs) : clock.played,
    against: clock.armed.against ? start(clock.against, nowMs) : clock.against,
  };
}

export function pauseMatch(clock: MatchClock, nowMs: number): MatchClock {
  return {
    ...clock,
    match: stop(clock.match, nowMs),
    played: stop(clock.played, nowMs),
    against: stop(clock.against, nowMs),
  };
}

export function toggleMatch(clock: MatchClock, nowMs: number): MatchClock {
  return isRunning(clock.match)
    ? pauseMatch(clock, nowMs)
    : startMatch(clock, nowMs);
}

/**
 * Arm or disarm one of the defense stopwatches. Arming while the match is
 * paused only records the intent — the seconds start when the match resumes.
 */
export function toggleDefense(
  clock: MatchClock,
  kind: DefenseKind,
  nowMs: number,
): MatchClock {
  const arming = !clock.armed[kind];
  const watch = clock[kind];
  return {
    ...clock,
    [kind]:
      arming && isRunning(clock.match)
        ? start(watch, nowMs)
        : stop(watch, nowMs),
    armed: { ...clock.armed, [kind]: arming },
  };
}
