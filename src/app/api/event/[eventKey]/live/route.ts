import { AuthError, requireUid } from "@/lib/auth/verifyBearerToken";
import { mapMatches, type TbaMatchSimple } from "@/lib/eventData";
import { getServerConfig } from "@/lib/serverConfig";

const TBA_BASE = "https://www.thebluealliance.com/api/v3";

// Live match feed for the Pit Dashboard: only the match list (scores +
// scheduled/predicted times) straight from TBA. Polled every minute and
// never persisted — unlike the main event sync — because scores and
// predicted times churn all day during a competition.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventKey: string }> },
): Promise<Response> {
  // Every call spends the app's TBA rate-limit budget — require a signed-in
  // account so a random visitor can't burn through it.
  try {
    await requireUid(req);
  } catch (err) {
    if (err instanceof AuthError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

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
    const res = await fetch(`${TBA_BASE}/event/${eventKey}/matches/simple`, {
      headers: { "X-TBA-Auth-Key": tbaApiKey },
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
    const tbaMatches = (await res.json()) as TbaMatchSimple[];
    return Response.json({
      matches: mapMatches(tbaMatches),
      fetchedAt: Date.now(),
    });
  } catch {
    return Response.json(
      { error: "Could not reach The Blue Alliance — try again." },
      { status: 502 },
    );
  }
}
