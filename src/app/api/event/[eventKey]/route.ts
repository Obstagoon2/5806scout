import {
  mapMatches,
  mapTeams,
  mapVenue,
  type StatboticsTeamEvent,
  type TbaEvent,
  type TbaMatchSimple,
  type TbaTeamSimple,
} from "@/lib/eventData";
import { getServerConfig } from "@/lib/serverConfig";

const TBA_BASE = "https://www.thebluealliance.com/api/v3";
const STATBOTICS_BASE = "https://api.statbotics.io/v3";

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function tbaFetch<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${TBA_BASE}${path}`, {
    headers: { "X-TBA-Auth-Key": apiKey },
    // Event data changes during competition — don't let Next cache it.
    cache: "no-store",
  });
  if (res.status === 404) {
    throw new HttpError(404, "Event not found — check the event code.");
  }
  if (res.status === 401) {
    throw new HttpError(502, "TBA rejected the API key (TBA_API_KEY).");
  }
  if (!res.ok) {
    throw new HttpError(502, `TBA request failed (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventKey: string }> },
): Promise<Response> {
  const { eventKey } = await params;
  const { tbaApiKey } = getServerConfig();

  if (!tbaApiKey) {
    return Response.json(
      {
        error:
          "TBA_API_KEY is not configured. Get a read key at thebluealliance.com/account and add it to .env.local.",
      },
      { status: 503 },
    );
  }

  if (!/^[a-z0-9]+$/i.test(eventKey)) {
    return Response.json({ error: "Invalid event code." }, { status: 400 });
  }

  try {
    const [event, tbaTeams, tbaMatches] = await Promise.all([
      tbaFetch<TbaEvent>(`/event/${eventKey}`, tbaApiKey),
      tbaFetch<TbaTeamSimple[]>(`/event/${eventKey}/teams/simple`, tbaApiKey),
      tbaFetch<TbaMatchSimple[]>(`/event/${eventKey}/matches/simple`, tbaApiKey),
    ]);

    // Statbotics is keyless; EPA is nice-to-have, so failures degrade to
    // "no EPA" rather than failing the whole sync.
    let statbotics: StatboticsTeamEvent[] = [];
    try {
      const res = await fetch(
        `${STATBOTICS_BASE}/team_events?event=${eventKey}&limit=200`,
        { cache: "no-store" },
      );
      if (res.ok) statbotics = (await res.json()) as StatboticsTeamEvent[];
    } catch {
      // EPA unavailable — teams still sync.
    }

    return Response.json({
      eventKey,
      eventName: event.name,
      teams: mapTeams(tbaTeams, statbotics),
      matches: mapMatches(tbaMatches),
      venue: mapVenue(event),
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json(
      { error: "Could not reach The Blue Alliance — try again." },
      { status: 502 },
    );
  }
}
