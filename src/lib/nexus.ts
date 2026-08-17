// FRC Nexus (https://frc.nexus/api/v1/docs) — two things TBA can't give us:
// the pit map for an event, and live queueing status for the next match.
// Raw payload subsets plus pure mappers into the shapes the UI renders; the
// API routes do the fetching so the Nexus-Api-Key stays server-side.

/** Every drawable element on a pit map shares this geometry. 10 units ≈ 1 ft. */
export interface NexusMapElement {
  position?: { x: number; y: number } | null;
  size?: { x: number; y: number } | null;
  angle?: number | null;
}

export interface NexusPitElement extends NexusMapElement {
  team?: string | null;
}

export interface NexusLabelElement extends NexusMapElement {
  label?: string | null;
}

export interface NexusArrowElement extends NexusMapElement {
  type?: "single" | "double" | null;
  color?: "red" | "blue" | "purple" | "gray" | null;
}

export interface NexusPitMapPayload {
  size?: { x: number; y: number } | null;
  /** Keyed by pit address ("A1"). */
  pits?: Record<string, NexusPitElement> | null;
  areas?: Record<string, NexusLabelElement> | null;
  labels?: Record<string, NexusLabelElement> | null;
  arrows?: Record<string, NexusArrowElement> | null;
  walls?: Record<string, NexusMapElement> | null;
}

/** Keyed by team number ("5806" -> "A12"). */
export type NexusPitAddresses = Record<string, string>;

// --- Mapped shapes the client renders ---

export interface PitMapBox {
  /** Pit address for pits, element id otherwise — unique within its list. */
  id: string;
  /** Center of the box, in map units. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rotation about the center, in degrees. */
  angle: number;
  /** Team number for a pit, text for an area/label, null when unlabelled. */
  label: string | null;
}

export interface PitMapArrow extends PitMapBox {
  direction: "single" | "double";
  color: "red" | "blue" | "purple" | "gray";
}

export interface PitMap {
  width: number;
  height: number;
  pits: PitMapBox[];
  areas: PitMapBox[];
  labels: PitMapBox[];
  walls: PitMapBox[];
  arrows: PitMapArrow[];
}

function toBox(
  id: string,
  element: NexusMapElement,
  label: string | null,
): PitMapBox {
  return {
    id,
    x: element.position?.x ?? 0,
    y: element.position?.y ?? 0,
    width: element.size?.x ?? 0,
    height: element.size?.y ?? 0,
    angle: element.angle ?? 0,
    label,
  };
}

function mapBoxes<T extends NexusMapElement>(
  elements: Record<string, T> | null | undefined,
  label: (element: T, id: string) => string | null,
): PitMapBox[] {
  if (!elements) return [];
  return Object.entries(elements).map(([id, element]) =>
    toBox(id, element, label(element, id)),
  );
}

/**
 * Fold the map payload into flat arrays of positioned boxes.
 *
 * `addresses` (the pullPitAddresses endpoint) is the team -> pit-address
 * directory; it's inverted here to fill in a pit's team when the map itself
 * doesn't carry one, which happens at events that lay out the map before
 * assigning teams.
 */
export function mapPitMap(
  payload: NexusPitMapPayload,
  addresses: NexusPitAddresses = {},
): PitMap {
  const teamByAddress = new Map<string, string>();
  for (const [team, address] of Object.entries(addresses)) {
    if (address) teamByAddress.set(address, team);
  }

  return {
    width: payload.size?.x ?? 0,
    height: payload.size?.y ?? 0,
    pits: mapBoxes(
      payload.pits,
      (pit, address) => pit.team ?? teamByAddress.get(address) ?? null,
    ),
    areas: mapBoxes(payload.areas, (area) => area.label ?? null),
    labels: mapBoxes(payload.labels, (label) => label.label ?? null),
    walls: mapBoxes(payload.walls, () => null),
    arrows: (payload.arrows
      ? Object.entries(payload.arrows)
      : []
    ).map(([id, arrow]) => ({
      ...toBox(id, arrow, null),
      direction: arrow.type ?? "single",
      color: arrow.color ?? "blue",
    })),
  };
}

/** Pit address for a team, or null when the event hasn't published one. */
export function pitAddressFor(
  addresses: NexusPitAddresses,
  teamNumber: string,
): string | null {
  return addresses[teamNumber] ?? null;
}

// --- Live event status ---

export type NexusMatchStatus =
  | "Queuing soon"
  | "Now queuing"
  | "On deck"
  | "On field";

export interface NexusMatchTimes {
  scheduledStartTime?: number | null;
  estimatedQueueTime?: number | null;
  estimatedOnDeckTime?: number | null;
  estimatedOnFieldTime?: number | null;
  estimatedStartTime?: number | null;
  actualQueueTime?: number | null;
  actualOnDeckTime?: number | null;
  actualOnFieldTime?: number | null;
  actualStartTime?: number | null;
  actualCommitTime?: number | null;
}

export interface NexusMatch {
  label: string;
  status: NexusMatchStatus;
  redTeams?: (string | null)[] | null;
  blueTeams?: (string | null)[] | null;
  times?: NexusMatchTimes | null;
  breakAfter?: string | null;
  replayOf?: string | null;
}

export interface NexusEventStatusPayload {
  eventKey?: string;
  dataAsOfTime?: number;
  nowQueuing?: string | null;
  matches?: NexusMatch[] | null;
  announcements?: unknown[] | null;
  partsRequests?: unknown[] | null;
}

export interface QueueMatch {
  label: string;
  status: NexusMatchStatus;
  redTeams: string[];
  blueTeams: string[];
  /** All unix ms; estimates until the lead queuer advances the match. */
  queueTime: number | null;
  onDeckTime: number | null;
  onFieldTime: number | null;
  startTime: number | null;
  breakAfter: string | null;
  isReplay: boolean;
}

export interface QueueStatus {
  eventKey: string;
  dataAsOfTime: number;
  /** Label of the match the event is calling to the queue right now. */
  nowQueuing: string | null;
  /** The match currently on the field, if the event has put one there. */
  onField: QueueMatch | null;
  /** Our team's next match that hasn't hit the field yet. */
  ourNext: QueueMatch | null;
  /** The next matches in play order, on-field one excluded. */
  upcoming: QueueMatch[];
}

/** How many upcoming matches the dashboard shows. */
export const UPCOMING_LIMIT = 4;

function teamList(teams: (string | null)[] | null | undefined): string[] {
  return (teams ?? []).filter((team): team is string => Boolean(team));
}

export function mapQueueMatch(match: NexusMatch): QueueMatch {
  const times = match.times ?? {};
  return {
    label: match.label,
    status: match.status,
    redTeams: teamList(match.redTeams),
    blueTeams: teamList(match.blueTeams),
    // Nexus sets the `actual*` stamp once the lead queuer advances a match and
    // leaves the estimate in place beforehand, so actual-then-estimate always
    // reads as the best currently-known time.
    queueTime: times.actualQueueTime ?? times.estimatedQueueTime ?? null,
    onDeckTime: times.actualOnDeckTime ?? times.estimatedOnDeckTime ?? null,
    onFieldTime: times.actualOnFieldTime ?? times.estimatedOnFieldTime ?? null,
    startTime:
      times.actualStartTime ??
      times.estimatedStartTime ??
      times.scheduledStartTime ??
      null,
    breakAfter: match.breakAfter ?? null,
    isReplay: Boolean(match.replayOf),
  };
}

export function matchHasTeam(match: QueueMatch, teamNumber: string): boolean {
  return (
    match.redTeams.includes(teamNumber) || match.blueTeams.includes(teamNumber)
  );
}

/**
 * Reduce a full event status to what the Pit Dashboard shows.
 *
 * Nexus has no "played" status — a finished match keeps `On field` until the
 * next one takes the field — so the *last* `On field` match in play order is
 * the live one and everything after it is still to come.
 */
export function selectQueueStatus(
  payload: NexusEventStatusPayload,
  teamNumber: string,
  limit: number = UPCOMING_LIMIT,
): QueueStatus {
  const matches = (payload.matches ?? []).map(mapQueueMatch);

  let onFieldIndex = -1;
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].status === "On field") {
      onFieldIndex = i;
      break;
    }
  }

  const remaining = matches.slice(onFieldIndex + 1);

  return {
    eventKey: payload.eventKey ?? "",
    dataAsOfTime: payload.dataAsOfTime ?? 0,
    nowQueuing: payload.nowQueuing ?? null,
    onField: onFieldIndex >= 0 ? matches[onFieldIndex] : null,
    ourNext: teamNumber
      ? (remaining.find((match) => matchHasTeam(match, teamNumber)) ?? null)
      : null,
    upcoming: remaining.slice(0, limit),
  };
}
