import {
  eventSearchYear,
  searchEvents,
  type TbaEventSimple,
} from "@/lib/eventData";
import { getServerConfig } from "@/lib/serverConfig";

const TBA_BASE = "https://www.thebluealliance.com/api/v3";

// A season's event list is ~250 rows and changes rarely — cache it per year
// so typing in the search box doesn't hammer TBA on every keystroke.
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<number, { fetchedAt: number; events: TbaEventSimple[] }>();

async function eventsForYear(
  year: number,
  apiKey: string,
): Promise<TbaEventSimple[]> {
  const hit = cache.get(year);
  if (hit && Date.now() - hit.fetchedAt < CACHE_MS) return hit.events;

  const res = await fetch(`${TBA_BASE}/events/${year}/simple`, {
    headers: { "X-TBA-Auth-Key": apiKey },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TBA request failed (${res.status}).`);
  const events = (await res.json()) as TbaEventSimple[];
  cache.set(year, { fetchedAt: Date.now(), events });
  return events;
}

export async function GET(req: Request): Promise<Response> {
  const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ results: [] });

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

  try {
    const year = eventSearchYear(query, new Date().getFullYear());
    const events = await eventsForYear(year, tbaApiKey);
    return Response.json({ results: searchEvents(events, query) });
  } catch {
    return Response.json(
      { error: "Could not reach The Blue Alliance — try again." },
      { status: 502 },
    );
  }
}
