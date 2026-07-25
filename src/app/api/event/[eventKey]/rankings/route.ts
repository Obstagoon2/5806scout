import {
  mapRankings,
  type StatboticsTeamEvent,
} from "@/lib/eventData";

const STATBOTICS_BASE = "https://api.statbotics.io/v3";

// Statbotics' v3 API is flaky: the same team_events request intermittently
// returns 500/503 and then succeeds on an immediate retry. The minute-poll
// Ranking view surfaced those blips as "Statbotics request failed (503)", so
// we retry transient upstream failures with a short backoff before giving up.
const MAX_ATTEMPTS = 3;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch, retrying on transient upstream errors (5xx/429) and network faults.
 *  Returns the last response even if it's an error, or null if every attempt
 *  threw. Backoff stays small (≤600ms total) — a client poll is one minute out. */
async function fetchWithRetry(url: string): Promise<Response | null> {
  let lastResponse: Response | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok || !RETRYABLE_STATUS.has(res.status)) return res;
      lastResponse = res;
    } catch {
      lastResponse = null;
    }
    if (attempt < MAX_ATTEMPTS) await delay(200 * attempt);
  }
  return lastResponse;
}

// Live event rankings straight from Statbotics (keyless API). The Ranking
// view polls this every minute — nothing is persisted, unlike the main
// event sync, because ranks churn constantly during quals.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventKey: string }> },
): Promise<Response> {
  const { eventKey } = await params;

  if (!/^[a-z0-9]+$/i.test(eventKey)) {
    return Response.json({ error: "Invalid event code." }, { status: 400 });
  }

  const res = await fetchWithRetry(
    `${STATBOTICS_BASE}/team_events?event=${eventKey}&limit=200`,
  );

  if (res === null) {
    return Response.json(
      { error: "Could not reach Statbotics — try again." },
      { status: 502 },
    );
  }
  if (!res.ok) {
    return Response.json(
      { error: `Statbotics request failed (${res.status}).` },
      { status: 502 },
    );
  }

  try {
    const statbotics = (await res.json()) as StatboticsTeamEvent[];
    return Response.json({
      rankings: mapRankings(statbotics),
      fetchedAt: Date.now(),
    });
  } catch {
    return Response.json(
      { error: "Statbotics returned an unexpected response — try again." },
      { status: 502 },
    );
  }
}
