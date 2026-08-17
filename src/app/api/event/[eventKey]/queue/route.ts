import { selectQueueStatus, type NexusEventStatusPayload } from "@/lib/nexus";
import { NEXUS_NOT_FOUND, nexusFetch } from "@/lib/nexusApi";

// Live queueing status for the Pit Dashboard. TBA tells us when a match is
// *scheduled*; Nexus tells us what the lead queuer is actually calling right
// now ("Now queuing", "On deck", "On field") — which is the number the pit
// crew acts on. Only events running Nexus queue management have this, so a
// 404 comes back as an empty status rather than an error.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ eventKey: string }> },
): Promise<Response> {
  const { eventKey } = await params;
  const teamNumber = new URL(req.url).searchParams.get("team") ?? "";

  if (!/^[a-z0-9]+$/i.test(eventKey)) {
    return Response.json({ error: "Invalid event code." }, { status: 400 });
  }
  if (teamNumber && !/^\d+$/.test(teamNumber)) {
    return Response.json({ error: "Invalid team number." }, { status: 400 });
  }

  const result = await nexusFetch<NexusEventStatusPayload>(`/event/${eventKey}`);

  if (!result.ok) {
    if (result.status === NEXUS_NOT_FOUND) {
      return Response.json({ status: null, fetchedAt: Date.now() });
    }
    return Response.json(
      { error: result.message },
      { status: result.status ?? 502 },
    );
  }

  return Response.json({
    status: selectQueueStatus(result.data, teamNumber),
    fetchedAt: Date.now(),
  });
}
