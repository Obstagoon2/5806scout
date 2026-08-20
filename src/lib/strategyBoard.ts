// Strategy Board: the digital whiteboard an admin draws a match plan on.
//
// Kept free of React and Firestore so the phase model, the match pick and the
// document normalizer are testable on their own (see strategyBoard.test.ts).
//
// One board per match, five phases deep. Each phase is its own field — its own
// strokes and its own marker positions — because a plan for where six robots
// sit at the buzzer says nothing about where they sit thirty seconds later.

import type { EventMatch } from "@/lib/eventData";
import { SKETCH_HEIGHT, SKETCH_WIDTH } from "@/lib/fieldSketch";

export type Alliance = "red" | "blue";

/** Alliance colors, matched to the pens in src/lib/fieldSketch.ts. */
export const ALLIANCE_COLORS: Record<Alliance, string> = {
  red: "#9f1239",
  blue: "#0369a1",
};

export type PhaseId =
  | "auto"
  | "transition"
  | "active"
  | "inactive"
  | "endgame";

export interface BoardPhase {
  id: PhaseId;
  label: string;
  /** One line under the tab saying what this phase is for. */
  blurb: string;
}

/**
 * The five phases of a match, in the order they happen. Only Auto pulls in
 * pit-scouted auto paths — the others are a plan the strategist draws, with
 * nothing scouted to overlay.
 */
export const BOARD_PHASES: readonly BoardPhase[] = [
  {
    id: "auto",
    label: "Auto",
    blurb:
      "The first fifteen seconds. Tick a robot's scouted auto to lay its path over the field.",
  },
  {
    id: "transition",
    label: "Transition",
    blurb: "Where everyone goes as auto ends and drivers take the controls.",
  },
  {
    id: "active",
    label: "Active",
    blurb: "The cycle everyone runs while the field is open.",
  },
  {
    id: "inactive",
    label: "Inactive",
    blurb: "Where to sit when a lane is blocked or a partner is down.",
  },
  {
    id: "endgame",
    label: "Endgame",
    blurb: "The last stretch — climbs, parks, and who covers them.",
  },
];

export const DEFAULT_PHASE: PhaseId = "auto";

/** Whether a phase offers the scouted-auto overlay. Only the first one does. */
export function phaseUsesAutos(phase: PhaseId): boolean {
  return phase === "auto";
}

export function isPhaseId(value: unknown): value is PhaseId {
  return BOARD_PHASES.some((phase) => phase.id === value);
}

// --- Match selection -------------------------------------------------------

/** A team's slot in a match — which robot a marker and an auto belong to. */
export interface BoardSlot {
  teamNumber: number;
  alliance: Alliance;
}

/** The six robots of a match, red first, in alliance-station order. */
export function matchSlots(match: EventMatch): BoardSlot[] {
  return [
    ...match.red.map((teamNumber) => ({ teamNumber, alliance: "red" as const })),
    ...match.blue.map((teamNumber) => ({
      teamNumber,
      alliance: "blue" as const,
    })),
  ];
}

const COMP_LEVEL_LABELS: Record<string, string> = {
  qm: "Qual",
  qf: "Quarterfinal",
  sf: "Semifinal",
  f: "Final",
};

/** "Qual 12" — how a match is named on the tab and in the picker. */
export function matchLabel(match: EventMatch): string {
  const level = COMP_LEVEL_LABELS[match.compLevel] ?? match.compLevel;
  return `${level} ${match.matchNumber}`;
}

/** A match is unplayed until the event feed gives it a score. */
export function isUnplayed(match: EventMatch): boolean {
  return match.redScore === null && match.blueScore === null;
}

/**
 * The match the board should open on: the next one nobody has played yet.
 * Falls back to the last match on the schedule once the event is over, so the
 * board is never empty when there are matches to look at.
 */
export function nextUpcomingMatch(
  matches: readonly EventMatch[],
): EventMatch | null {
  if (matches.length === 0) return null;
  return matches.find(isUnplayed) ?? matches[matches.length - 1];
}

// --- Board state -----------------------------------------------------------

export interface TokenPosition {
  x: number;
  y: number;
}

export interface PhaseState {
  /** Serialized strokes — see src/lib/fieldSketch.ts. */
  strokes: string;
  /** Marker position per team number, in canvas coordinates. */
  tokens: Record<string, TokenPosition>;
}

export interface BoardState {
  phases: Record<PhaseId, PhaseState>;
  /**
   * Which scouted autos are laid over the Auto phase, as "team:autoId" keys
   * (see autoSelectionKey). A flat list rather than a map so Firestore stores
   * it as one array field.
   */
  selectedAutos: string[];
}

export function emptyPhaseState(): PhaseState {
  return { strokes: "", tokens: {} };
}

export function emptyBoardState(): BoardState {
  return {
    phases: Object.fromEntries(
      BOARD_PHASES.map((phase) => [phase.id, emptyPhaseState()]),
    ) as Record<PhaseId, PhaseState>,
    selectedAutos: [],
  };
}

/** How an auto selection is stored — one string, so it fits a Firestore array. */
export function autoSelectionKey(teamNumber: number, autoId: string): string {
  return `${teamNumber}:${autoId}`;
}

/**
 * Where the six markers start before anyone drags them: each alliance stacked
 * in its own end of the field, in station order. Positions are canvas
 * coordinates, matched to the sketch resolution.
 */
export function defaultTokenPositions(
  match: EventMatch,
): Record<string, TokenPosition> {
  const positions: Record<string, TokenPosition> = {};
  const redX = SKETCH_WIDTH * 0.08;
  const blueX = SKETCH_WIDTH * 0.92;
  // Three stations spread down the wall, clear of the top and bottom edges.
  const rows = [0.25, 0.5, 0.75].map((fraction) => SKETCH_HEIGHT * fraction);

  match.red.forEach((teamNumber, index) => {
    positions[String(teamNumber)] = { x: redX, y: rows[index] ?? rows[0] };
  });
  match.blue.forEach((teamNumber, index) => {
    positions[String(teamNumber)] = { x: blueX, y: rows[index] ?? rows[0] };
  });
  return positions;
}

/** Keep a dragged marker on the field rather than off the edge of the canvas. */
export function clampToField(point: TokenPosition): TokenPosition {
  return {
    x: Math.min(Math.max(point.x, 0), SKETCH_WIDTH),
    y: Math.min(Math.max(point.y, 0), SKETCH_HEIGHT),
  };
}

// --- Persistence -----------------------------------------------------------

function parseTokens(raw: unknown): Record<string, TokenPosition> {
  if (typeof raw !== "object" || raw === null) return {};
  const tokens: Record<string, TokenPosition> = {};
  for (const [team, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const { x, y } = value as Record<string, unknown>;
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    tokens[team] = clampToField({ x, y });
  }
  return tokens;
}

/**
 * Normalize a board document into state the UI can render.
 *
 * Tolerant on purpose: this reads documents written by other admins' browsers
 * and by earlier builds, and a phase that arrives malformed should cost that
 * phase's drawing, not the whole board.
 */
export function parseBoardState(raw: unknown): BoardState {
  const state = emptyBoardState();
  if (typeof raw !== "object" || raw === null) return state;
  const record = raw as Record<string, unknown>;

  const phases = record.phases;
  if (typeof phases === "object" && phases !== null) {
    for (const phase of BOARD_PHASES) {
      const value = (phases as Record<string, unknown>)[phase.id];
      if (typeof value !== "object" || value === null) continue;
      const entry = value as Record<string, unknown>;
      state.phases[phase.id] = {
        strokes: typeof entry.strokes === "string" ? entry.strokes : "",
        tokens: parseTokens(entry.tokens),
      };
    }
  }

  if (Array.isArray(record.selectedAutos)) {
    state.selectedAutos = record.selectedAutos.filter(
      (key): key is string => typeof key === "string",
    );
  }

  return state;
}

/**
 * Marker positions for a phase, falling back to the starting layout for any
 * robot nobody has dragged yet. Teams that aren't in this match are dropped —
 * a board saved before the schedule was re-synced can name robots that have
 * since moved to another match.
 */
export function phaseTokens(
  phase: PhaseState,
  match: EventMatch,
): Record<string, TokenPosition> {
  const defaults = defaultTokenPositions(match);
  const tokens: Record<string, TokenPosition> = {};
  for (const team of Object.keys(defaults)) {
    tokens[team] = phase.tokens[team] ?? defaults[team];
  }
  return tokens;
}

// --- Forecast presentation -------------------------------------------------

export interface ForecastSplit {
  redPercent: number | null;
  bluePercent: number | null;
  /** Who the numbers favour, or null when it is level (or unknowable). */
  favourite: Alliance | null;
}

/**
 * Both alliances' win chance as whole percentages, plus who is favoured.
 *
 * Rounded once and subtracted, never rounded twice: rounding each side
 * independently shows 49% against 52% often enough to be noticed, and a board
 * that cannot add up is a board nobody trusts on the harder numbers either.
 */
export function forecastSplit(
  redWinProbability: number | null,
): ForecastSplit {
  if (redWinProbability === null) {
    return { redPercent: null, bluePercent: null, favourite: null };
  }
  const redPercent = Math.round(redWinProbability * 100);
  const bluePercent = 100 - redPercent;
  return {
    redPercent,
    bluePercent,
    favourite:
      redPercent === bluePercent ? null : redPercent > bluePercent ? "red" : "blue",
  };
}
