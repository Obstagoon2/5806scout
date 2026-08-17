import { mapPitMap, type NexusPitAddresses, type NexusPitMapPayload } from "@/lib/nexus";
import { NEXUS_NOT_FOUND, nexusFetch } from "@/lib/nexusApi";

// Pit map for the Event tab. Nexus publishes both the drawn map
// (/event/{key}/map) and the team -> pit-address directory
// (/event/{key}/pits); the map alone often has empty pits, so the directory
// fills in which team sits where. Not persisted — the Event tab fetches it
// for whatever event is currently synced.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventKey: string }> },
): Promise<Response> {
  const { eventKey } = await params;

  if (!/^[a-z0-9]+$/i.test(eventKey)) {
    return Response.json({ error: "Invalid event code." }, { status: 400 });
  }

  const [map, addresses] = await Promise.all([
    nexusFetch<NexusPitMapPayload>(`/event/${eventKey}/map`),
    nexusFetch<NexusPitAddresses>(`/event/${eventKey}/pits`),
  ]);

  // Addresses without a drawn map still answer "which pit is team X in?", so
  // that alone is a useful response; only a missing map *and* missing
  // addresses is an empty result.
  if (!map.ok && !addresses.ok) {
    if (map.status === NEXUS_NOT_FOUND && addresses.status === NEXUS_NOT_FOUND) {
      return Response.json({
        map: null,
        addresses: {},
        fetchedAt: Date.now(),
      });
    }
    return Response.json({ error: map.message }, { status: map.status ?? 502 });
  }

  const addressDirectory = addresses.ok ? addresses.data : {};

  return Response.json({
    map: map.ok ? mapPitMap(map.data, addressDirectory) : null,
    addresses: addressDirectory,
    fetchedAt: Date.now(),
  });
}
