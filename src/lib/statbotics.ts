// Statbotics v3 client.
//
// The API is public and read-only — there is NO API key, so nothing here sends
// an auth header (see https://api.statbotics.io/v3). What it does do is fail
// transiently: the same request intermittently returns 429/5xx and then
// succeeds on an immediate retry, and during an upstream outage every endpoint
// returns `500 {}` while the host itself still serves 200. So every request
// retries with exponential backoff, and callers get an explicit ok/failure
// result instead of an empty list they can't distinguish from "no data yet".

import type { StatboticsTeamEvent } from "@/lib/eventData";

export const STATBOTICS_BASE = "https://api.statbotics.io/v3";

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** Exponential backoff, matching the reference client's curve: 300 * attempt². */
function backoffMs(attempt: number): number {
  return 300 * attempt * attempt;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface StatboticsFetchOptions {
  maxAttempts?: number;
  /** Injectable for tests so retry backoff doesn't cost real wall-clock time. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Success carries the parsed payload; failure carries the last upstream status
 * (null when every attempt threw before producing a response, i.e. the network
 * or DNS failed). Callers must handle failure explicitly — an unreachable
 * Statbotics is not the same as an event with no EPA yet.
 */
export type StatboticsResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null };

/** Fetch, retrying transient upstream errors (429/5xx) and network faults. */
async function fetchWithRetry(
  url: string,
  { maxAttempts = DEFAULT_MAX_ATTEMPTS, sleep = defaultSleep }: StatboticsFetchOptions,
): Promise<Response | null> {
  let lastResponse: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      // Non-retryable statuses (including 404) are the caller's to interpret.
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
      lastResponse = res;
    } catch {
      lastResponse = null;
    }
    if (attempt < maxAttempts) await sleep(backoffMs(attempt));
  }
  return lastResponse;
}

/**
 * Team-event rows (EPA + qual record) for one event. A 404 means Statbotics
 * has never heard of the event, which for a list endpoint is an empty result
 * rather than an error — same convention as the reference client.
 */
export async function fetchTeamEvents(
  eventKey: string,
  options: StatboticsFetchOptions = {},
): Promise<StatboticsResult<StatboticsTeamEvent[]>> {
  const res = await fetchWithRetry(
    `${STATBOTICS_BASE}/team_events?event=${encodeURIComponent(eventKey)}&limit=200`,
    options,
  );

  if (res === null) return { ok: false, status: null };
  if (res.status === 404) return { ok: true, data: [] };
  if (!res.ok) return { ok: false, status: res.status };

  try {
    const body: unknown = await res.json();
    // During the outage the API answers 200-shaped errors as `{}`; anything
    // that isn't an array is a failure, not an event with zero teams.
    if (!Array.isArray(body)) return { ok: false, status: res.status };
    return { ok: true, data: body as StatboticsTeamEvent[] };
  } catch {
    return { ok: false, status: res.status };
  }
}
