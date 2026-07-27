import { mapRankings } from "@/lib/eventData";
import { fetchTeamEvents } from "@/lib/statbotics";

// Live event rankings straight from Statbotics (keyless API — no key exists).
// The Ranking view polls this every minute — nothing is persisted, unlike the
// main event sync, because ranks churn constantly during quals. Retry/backoff
// for Statbotics' transient 5xx lives in @/lib/statbotics.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventKey: string }> },
): Promise<Response> {
  const { eventKey } = await params;

  if (!/^[a-z0-9]+$/i.test(eventKey)) {
    return Response.json({ error: "Invalid event code." }, { status: 400 });
  }

  const result = await fetchTeamEvents(eventKey);

  if (!result.ok) {
    return Response.json(
      {
        error:
          result.status === null
            ? "Could not reach Statbotics — try again."
            : `Statbotics request failed (${result.status}).`,
      },
      { status: 502 },
    );
  }

  return Response.json({
    rankings: mapRankings(result.data),
    fetchedAt: Date.now(),
  });
}
