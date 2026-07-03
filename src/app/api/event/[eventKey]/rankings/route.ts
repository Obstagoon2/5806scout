import {
  mapRankings,
  type StatboticsTeamEvent,
} from "@/lib/eventData";

const STATBOTICS_BASE = "https://api.statbotics.io/v3";

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

  try {
    const res = await fetch(
      `${STATBOTICS_BASE}/team_events?event=${eventKey}&limit=200`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return Response.json(
        { error: `Statbotics request failed (${res.status}).` },
        { status: 502 },
      );
    }
    const statbotics = (await res.json()) as StatboticsTeamEvent[];
    return Response.json({
      rankings: mapRankings(statbotics),
      fetchedAt: Date.now(),
    });
  } catch {
    return Response.json(
      { error: "Could not reach Statbotics — try again." },
      { status: 502 },
    );
  }
}
