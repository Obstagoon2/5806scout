import {
  mapRankings,
  type TbaEventRankings,
  type TbaTeamSimple,
} from "@/lib/eventData";
import { getServerConfig } from "@/lib/serverConfig";

// Official event rankings from The Blue Alliance — the same standings the
// field displays and alliance selection runs off. The Ranking view polls this
// every minute and nothing is persisted, unlike the main event sync, because
// ranks churn constantly during quals.
//
// TBA's rankings carry team keys but no nicknames, so the team list comes
// along for names. Names are cosmetic: if that call fails the table still
// renders with team numbers.

const TBA_BASE = "https://www.thebluealliance.com/api/v3";

async function tbaFetch(path: string, apiKey: string): Promise<Response> {
  return fetch(`${TBA_BASE}${path}`, {
    headers: { "X-TBA-Auth-Key": apiKey },
    cache: "no-store",
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventKey: string }> },
): Promise<Response> {
  const { eventKey } = await params;
  const { tbaApiKey } = getServerConfig();

  if (!/^[a-z0-9]+$/i.test(eventKey)) {
    return Response.json({ error: "Invalid event code." }, { status: 400 });
  }

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
    const [rankingsRes, teamsRes] = await Promise.all([
      tbaFetch(`/event/${eventKey}/rankings`, tbaApiKey),
      tbaFetch(`/event/${eventKey}/teams/simple`, tbaApiKey),
    ]);

    if (rankingsRes.status === 404) {
      return Response.json(
        { error: "Event not found — check the event code." },
        { status: 404 },
      );
    }
    if (rankingsRes.status === 401) {
      return Response.json(
        { error: "TBA rejected the API key (TBA_API_KEY)." },
        { status: 502 },
      );
    }
    if (!rankingsRes.ok) {
      return Response.json(
        { error: `TBA request failed (${rankingsRes.status}).` },
        { status: 502 },
      );
    }

    // TBA answers 200 with a literal `null` body before quals start — that's
    // "no rankings yet", which maps to an empty table, not an error.
    const payload = (await rankingsRes.json()) as TbaEventRankings | null;
    const teams = teamsRes.ok
      ? ((await teamsRes.json()) as TbaTeamSimple[])
      : [];

    return Response.json({
      rankings: mapRankings(payload ?? {}, teams),
      fetchedAt: Date.now(),
    });
  } catch {
    return Response.json(
      { error: "Could not reach The Blue Alliance — try again." },
      { status: 502 },
    );
  }
}
