import { mapMatchVideos, type TbaMatchWithVideos } from "@/lib/matchReview";
import { getServerConfig } from "@/lib/serverConfig";

const TBA_BASE = "https://www.thebluealliance.com/api/v3";

// Match video keys for the Review tab, straight from TBA and never persisted.
//
// This is the one thing the main event sync can't supply: `videos` only exists
// on TBA's full match model, and the sync fetches `/matches/simple` (which is
// a fifth the size and has everything else the app needs). Fetching live is
// also the right shape for the data — official uploads land hours to days
// after a match, so a value frozen at last sync would report "no video" long
// after one existed, and re-syncing is a manual action on the Event tab.

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
    const res = await fetch(`${TBA_BASE}/event/${eventKey}/matches`, {
      headers: { "X-TBA-Auth-Key": tbaApiKey },
      // Videos appear through the day — a cached list would go stale during
      // exactly the window someone wants to review the match they just played.
      cache: "no-store",
    });
    if (res.status === 404) {
      return Response.json(
        { error: "Event not found — check the event code." },
        { status: 404 },
      );
    }
    if (!res.ok) {
      return Response.json(
        { error: `TBA request failed (${res.status}).` },
        { status: 502 },
      );
    }
    const tbaMatches = (await res.json()) as TbaMatchWithVideos[];
    return Response.json({
      videos: mapMatchVideos(tbaMatches),
      fetchedAt: Date.now(),
    });
  } catch {
    return Response.json(
      { error: "Could not reach The Blue Alliance — try again." },
      { status: 502 },
    );
  }
}
