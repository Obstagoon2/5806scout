// Server-side FRC Nexus client. Kept apart from @/lib/nexus (types + pure
// mappers, imported by client components) because it reads the API key out of
// the server config — that key must never end up in the client bundle.

import { getServerConfig } from "@/lib/serverConfig";

export const NEXUS_BASE = "https://frc.nexus/api/v1";

export const NEXUS_SETUP_MESSAGE =
  "NEXUS_API_KEY is not configured. Get a key at frc.nexus/api and add it to .env.local.";

/**
 * Failure carries a status and a message the UI can show as-is. `status` is
 * null when the request never reached Nexus (network/DNS).
 */
export type NexusResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number | null; message: string };

/**
 * Not every event runs Nexus queueing, and plenty never publish a pit map, so
 * a 404 is an ordinary "no data for this event" — callers render an empty
 * state for it rather than an error.
 */
export const NEXUS_NOT_FOUND = 404;

export async function nexusFetch<T>(path: string): Promise<NexusResult<T>> {
  const { nexusApiKey } = getServerConfig();
  if (!nexusApiKey) {
    return { ok: false, status: 503, message: NEXUS_SETUP_MESSAGE };
  }

  let res: Response;
  try {
    res = await fetch(`${NEXUS_BASE}${path}`, {
      headers: { "Nexus-Api-Key": nexusApiKey },
      // Queueing status changes minute to minute during an event.
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: null,
      message: "Could not reach FRC Nexus — try again.",
    };
  }

  if (res.status === NEXUS_NOT_FOUND) {
    return {
      ok: false,
      status: NEXUS_NOT_FOUND,
      message: "Nexus has no data for this event.",
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      status: 502,
      message: "Nexus rejected the API key (NEXUS_API_KEY).",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      status: 502,
      message: `Nexus request failed (${res.status}).`,
    };
  }

  try {
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return {
      ok: false,
      status: 502,
      message: "Nexus returned a response we couldn't read.",
    };
  }
}
