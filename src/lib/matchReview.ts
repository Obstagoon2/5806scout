import type { EventMatch } from "@/lib/eventData";
import { formatClock, TELEOP_SECONDS, TELEOP_SHIFTS } from "@/lib/matchTimer";

// Film study for the Review tab: a TBA match video, and notes pinned to
// moments in it.
//
// The hard part isn't the player, it's that video time isn't match time. TBA's
// clips come off the official FIRST channel one per match ("Qualification 1 -
// Rocket City Regional") and each one opens on a field-reset shot of unknown
// length, so a note saved at 0:47 of the video is not 0:47 into the match. An
// admin marks the green flag once per clip and everything after that reads in
// arena time — AUTO 0:14, SHIFT 2 1:31 — which is the only form a note is
// still legible in a week later, or to someone who wasn't in the room.
//
// REBUILT (2026) match structure, from the game manual: a 20-second autonomous
// period, a 3-second scoring pause, then 2:20 of teleop split into the shifts
// matchTimer.ts already encodes. Arena time counts DOWN in both periods —
// notes quote what was on the field display, not seconds elapsed.

/** Autonomous period length in seconds — 0:20 on the arena timer. */
export const AUTO_SECONDS = 20;

/**
 * The scoring pause between auto and teleop. Short, but it's dead time in the
 * video: without it every teleop note would read three seconds early.
 */
export const AUTO_PAUSE_SECONDS = 3;

/** Whole match, green flag to buzzer. */
export const MATCH_SECONDS = AUTO_SECONDS + AUTO_PAUSE_SECONDS + TELEOP_SECONDS;

export type ReviewPhase = "pre" | "auto" | "pause" | "teleop" | "post";

export interface MatchMoment {
  phase: ReviewPhase;
  /**
   * Seconds on the arena display for this phase, counting down. Null outside
   * auto and teleop — there's no arena clock before the green flag or after
   * the buzzer.
   */
  arenaSeconds: number | null;
  /** Teleop shift name ("Shift 2", "End game"), null outside teleop. */
  shift: string | null;
  /** Seconds since the green flag. Negative before it. */
  elapsedSeconds: number;
}

const PHASE_LABELS: Record<ReviewPhase, string> = {
  pre: "PRE",
  auto: "AUTO",
  pause: "PAUSE",
  teleop: "TELE",
  post: "POST",
};

export function phaseLabel(phase: ReviewPhase): string {
  return PHASE_LABELS[phase];
}

/**
 * Where a point in the video falls in the match, given the offset an admin
 * marked. An unmarked clip has offset 0, which reads as "the video starts on
 * the green flag" — wrong, but wrong in the direction that shows AUTO on
 * frame one, so it's visibly unmarked rather than quietly plausible.
 */
export function momentAt(
  videoSeconds: number,
  offsetSeconds: number,
): MatchMoment {
  const elapsed = videoSeconds - offsetSeconds;
  if (elapsed < 0) {
    return { phase: "pre", arenaSeconds: null, shift: null, elapsedSeconds: elapsed };
  }
  if (elapsed < AUTO_SECONDS) {
    return {
      phase: "auto",
      // Ceil so the first instant of the period reads as its full length —
      // an arena timer shows 0:20, never 0:19, the moment auto starts.
      arenaSeconds: Math.ceil(AUTO_SECONDS - elapsed),
      shift: null,
      elapsedSeconds: elapsed,
    };
  }
  const sinceTeleop = elapsed - AUTO_SECONDS - AUTO_PAUSE_SECONDS;
  if (sinceTeleop < 0) {
    return { phase: "pause", arenaSeconds: null, shift: null, elapsedSeconds: elapsed };
  }
  if (sinceTeleop < TELEOP_SECONDS) {
    return {
      phase: "teleop",
      arenaSeconds: Math.ceil(TELEOP_SECONDS - sinceTeleop),
      shift: shiftNameAt(sinceTeleop),
      elapsedSeconds: elapsed,
    };
  }
  return { phase: "post", arenaSeconds: null, shift: null, elapsedSeconds: elapsed };
}

/**
 * Which teleop shift a moment falls in. matchTimer's own `shiftAt` returns
 * "Match over" past the buzzer, which is the right answer for a live scout and
 * the wrong one here — momentAt has already decided the phase by the time this
 * runs, so it only ever sees in-teleop seconds.
 */
function shiftNameAt(secondsIntoTeleop: number): string {
  let label = TELEOP_SHIFTS[0].label;
  for (const shift of TELEOP_SHIFTS) {
    if (secondsIntoTeleop >= shift.startsAt) label = shift.label;
  }
  return label;
}

/**
 * A moment as a note stamp — "AUTO 0:14", "TELE 1:31". Short enough to sit in
 * a list, and it reads the way the field display did at that instant.
 */
export function formatMoment(moment: MatchMoment): string {
  if (moment.arenaSeconds === null) return phaseLabel(moment.phase);
  return `${phaseLabel(moment.phase)} ${formatClock(moment.arenaSeconds)}`;
}

/** Raw video position, for the player's own readout. */
export function formatVideoTime(videoSeconds: number): string {
  return formatClock(Math.max(0, videoSeconds));
}

// --- Stored shapes ---------------------------------------------------------

/**
 * Per-match review state: where the green flag is in that match's clip. One
 * doc per match under `teams/{teamId}/matchReview`, keyed by TBA match key.
 * Kept apart from the notes so two admins writing notes never race each other
 * over the offset.
 */
export interface MatchReviewDoc {
  matchKey: string;
  /** Video seconds at which the match starts. */
  videoOffsetSeconds: number;
  /**
   * Whether a human marked this clip, as opposed to it inheriting a guess from
   * a sibling clip. An inherited offset is usually right — one uploader cuts
   * every clip at an event the same way — but "usually right" has to be
   * visible, because a re-cut clip would otherwise shift every note on it
   * without anything on screen saying so.
   */
  confirmed: boolean;
  markedByName: string;
  markedAtMs: number;
}

/** A note pinned to a moment in a match video. */
export interface MatchReviewNote {
  id: string;
  matchKey: string;
  /** Position in the VIDEO, not the match — the offset can be re-marked. */
  videoSeconds: number;
  /** Which robot this is about, or null for a note about the match itself. */
  teamNumber: number | null;
  text: string;
  authorUid: string;
  authorName: string;
  createdAtMs: number;
}

/** Notes in the order they happen on the field. */
export function sortNotes(
  notes: readonly MatchReviewNote[],
): MatchReviewNote[] {
  return [...notes].sort(
    (a, b) => a.videoSeconds - b.videoSeconds || a.createdAtMs - b.createdAtMs,
  );
}

/** The six robots on the field, red first, as a note can be tagged to any. */
export function matchTeams(match: EventMatch): number[] {
  return [...match.red, ...match.blue];
}

/**
 * The matches the Review tab lists: played ones, newest first, narrowed to one
 * robot when a team is picked. Newest first because the match you want back is
 * almost always the one that just happened — the schedule order every other
 * screen uses would bury it under the whole event.
 */
export function reviewableMatches(
  matches: readonly EventMatch[],
  teamNumber: number | null,
): EventMatch[] {
  return matches
    .filter(
      (m) =>
        m.redScore !== null &&
        m.blueScore !== null &&
        (teamNumber === null ||
          m.red.includes(teamNumber) ||
          m.blue.includes(teamNumber)),
    )
    .reverse();
}

export function allianceOf(
  match: EventMatch,
  teamNumber: number,
): "red" | "blue" | null {
  if (match.red.includes(teamNumber)) return "red";
  if (match.blue.includes(teamNumber)) return "blue";
  return null;
}

/**
 * The offset to open a clip with. A confirmed mark on this match wins; failing
 * that, the most recently confirmed mark on any other clip at the event, since
 * one uploader cuts them all the same way. Null when nothing has been marked
 * yet and there's nothing to borrow.
 */
export function resolveOffset(
  matchKey: string,
  docs: readonly MatchReviewDoc[],
): { seconds: number; confirmed: boolean; inheritedFrom: string | null } | null {
  const own = docs.find((d) => d.matchKey === matchKey);
  if (own?.confirmed) {
    return { seconds: own.videoOffsetSeconds, confirmed: true, inheritedFrom: null };
  }
  const donor = docs
    .filter((d) => d.confirmed && d.matchKey !== matchKey)
    .sort((a, b) => b.markedAtMs - a.markedAtMs)[0];
  if (donor) {
    return {
      seconds: donor.videoOffsetSeconds,
      confirmed: false,
      inheritedFrom: donor.matchKey,
    };
  }
  return null;
}

// --- Video keys ------------------------------------------------------------

/** TBA's `videos` entry on the full match model. */
export interface TbaMatchVideo {
  key: string;
  type: string;
}

export interface TbaMatchWithVideos {
  key: string;
  videos?: TbaMatchVideo[] | null;
}

/**
 * Match key → YouTube id, for the matches that have one. TBA also serves a
 * `tba` video type (their own hosting, rare and mostly historical) which the
 * embed can't play, so it's dropped rather than handed to a player that would
 * show an error where a video should be.
 */
export function mapMatchVideos(
  matches: readonly TbaMatchWithVideos[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of matches) {
    const youtube = (match.videos ?? []).find(
      (v) => v && v.type === "youtube" && typeof v.key === "string" && v.key,
    );
    if (youtube) out[match.key] = youtube.key;
  }
  return out;
}
