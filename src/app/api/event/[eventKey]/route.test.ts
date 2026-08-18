import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventData } from "@/lib/eventData";
import { GET } from "./route";

vi.mock("@/lib/serverConfig", () => ({
  getServerConfig: vi.fn(),
}));

import { getServerConfig, type ServerConfig } from "@/lib/serverConfig";

const mockGetServerConfig = vi.mocked(getServerConfig);

/** A complete ServerConfig stub. The Cloudflare AI Search fields are unused
 *  by these routes but required by the type, so they get inert placeholders. */
function serverConfig(tbaApiKey: string | null): ServerConfig {
  return {
    tbaApiKey,
    nexusApiKey: null,
    manualQaRagUrl: "https://rag.test",
    cfAccountId: "test-account",
    cfAiSearchInstance: "test-instance",
    cfAiSearchToken: null,
  };
}

function params(eventKey: string) {
  return { params: Promise.resolve({ eventKey }) };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/event/[eventKey]", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 when TBA_API_KEY is not configured", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig(null));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/TBA_API_KEY/);
  });

  it("returns 400 for an invalid event code", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));

    const res = await GET(new Request("http://test"), params("bad key!"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when TBA reports the event doesn't exist", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, 404)),
    );

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(404);
  });

  it("returns 502 when TBA rejects the API key", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("bad-key"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/TBA_API_KEY/);
  });

  it("returns 502 on a generic TBA failure", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
  });

  it("returns 502 when fetch throws (network failure)", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Could not reach The Blue Alliance/);
  });

  it("degrades gracefully to no EPA when Statbotics fails, but still syncs teams", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("thebluealliance")) {
        if (url.includes("/teams/simple")) {
          return jsonResponse([
            { team_number: 5806, nickname: "Basement Lions", city: "Livingston" },
          ]);
        }
        if (url.includes("/matches/simple")) {
          return jsonResponse([]);
        }
        return jsonResponse({
          name: "Test Event",
          location_name: null,
          address: null,
          city: null,
          gmaps_url: null,
          lat: null,
          lng: null,
        });
      }
      if (url.includes("statbotics")) {
        throw new Error("statbotics down");
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as EventData & { epaAvailable: boolean };
    expect(body.teams[0].epa).toBeNull();
    expect(body.eventName).toBe("Test Event");
    // The client keys off this to avoid persisting null EPA over good data.
    expect(body.epaAvailable).toBe(false);
  });

  it("syncs teams, matches, and venue on success", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/teams/simple")) {
        return jsonResponse([
          { team_number: 5806, nickname: "Basement Lions", city: "Livingston" },
        ]);
      }
      if (url.includes("/matches/simple")) {
        return jsonResponse([]);
      }
      if (url.includes("statbotics")) {
        return jsonResponse([{ team: 5806, epa: { total_points: 41.7 } }]);
      }
      return jsonResponse({
        name: "Test Event",
        location_name: "Some HS",
        address: "1 Main St",
        city: "Somewhere",
        gmaps_url: null,
        lat: null,
        lng: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as EventData & { epaAvailable: boolean };
    expect(body.eventKey).toBe("2026test");
    expect(body.teams[0].epa).toBeCloseTo(41.7);
    expect(body.venue?.name).toBe("Some HS");
    expect(body.epaAvailable).toBe(true);
  });

  it("merges TBA OPRs into the team list", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/oprs")) {
        return jsonResponse({ oprs: { frc5806: 28.4 }, dprs: {}, ccwms: {} });
      }
      if (url.includes("/teams/simple")) {
        return jsonResponse([
          { team_number: 5806, nickname: "Basement Lions", city: "Livingston" },
        ]);
      }
      if (url.includes("/matches/simple")) return jsonResponse([]);
      if (url.includes("statbotics")) return jsonResponse([]);
      return jsonResponse({
        name: "Test Event",
        location_name: null,
        address: null,
        city: null,
        gmaps_url: null,
        lat: null,
        lng: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(new Request("http://test"), params("2026test"));
    const body = (await res.json()) as EventData & { oprAvailable: boolean };
    expect(body.teams[0].opr).toBeCloseTo(28.4);
    expect(body.oprAvailable).toBe(true);
  });

  // TBA 404s this endpoint until quals have been played. That's the normal
  // pre-event case, so it must not take the whole sync down with it.
  it("still syncs when TBA has no OPRs yet", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/oprs")) return jsonResponse({}, 404);
      if (url.includes("/teams/simple")) {
        return jsonResponse([
          { team_number: 5806, nickname: "Basement Lions", city: "Livingston" },
        ]);
      }
      if (url.includes("/matches/simple")) return jsonResponse([]);
      if (url.includes("statbotics")) return jsonResponse([]);
      return jsonResponse({
        name: "Test Event",
        location_name: null,
        address: null,
        city: null,
        gmaps_url: null,
        lat: null,
        lng: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as EventData & { oprAvailable: boolean };
    expect(body.teams).toHaveLength(1);
    expect(body.teams[0].opr).toBeNull();
    expect(body.oprAvailable).toBe(false);
  });

  // Regression: a Statbotics outage answers every endpoint with `500 {}` while
  // the host still serves 200s. Before this, the sync reported success with a
  // full column of null EPA, which the client persisted over good data.
  it("flags EPA unavailable when Statbotics 500s on every attempt", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("statbotics")) return jsonResponse({}, 500);
      if (url.includes("/teams/simple")) {
        return jsonResponse([
          { team_number: 5806, nickname: "Basement Lions", city: "Livingston" },
        ]);
      }
      if (url.includes("/matches/simple")) return jsonResponse([]);
      return jsonResponse({
        name: "Test Event",
        location_name: null,
        address: null,
        city: null,
        gmaps_url: null,
        lat: null,
        lng: null,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as EventData & { epaAvailable: boolean };
    expect(body.epaAvailable).toBe(false);
    expect(body.teams[0].epa).toBeNull();
    // Teams and schedule still sync — only EPA is degraded.
    expect(body.teams).toHaveLength(1);
  });
});
