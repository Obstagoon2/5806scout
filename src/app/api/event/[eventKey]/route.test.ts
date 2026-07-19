import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventData } from "@/lib/eventData";
import { GET } from "./route";

vi.mock("@/lib/serverConfig", () => ({
  getServerConfig: vi.fn(),
}));

import { getServerConfig } from "@/lib/serverConfig";

const mockGetServerConfig = vi.mocked(getServerConfig);

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
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      manualQaRagUrl: "https://rag.test",
    });

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/TBA_API_KEY/);
  });

  it("returns 400 for an invalid event code", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: "key",
      manualQaRagUrl: "https://rag.test",
    });

    const res = await GET(new Request("http://test"), params("bad key!"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when TBA reports the event doesn't exist", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: "key",
      manualQaRagUrl: "https://rag.test",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({}, 404)),
    );

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(404);
  });

  it("returns 502 when TBA rejects the API key", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: "bad-key",
      manualQaRagUrl: "https://rag.test",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 401)));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/TBA_API_KEY/);
  });

  it("returns 502 on a generic TBA failure", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: "key",
      manualQaRagUrl: "https://rag.test",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
  });

  it("returns 502 when fetch throws (network failure)", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: "key",
      manualQaRagUrl: "https://rag.test",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Could not reach The Blue Alliance/);
  });

  it("degrades gracefully to no EPA when Statbotics fails, but still syncs teams", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: "key",
      manualQaRagUrl: "https://rag.test",
    });

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
    const body = (await res.json()) as EventData;
    expect(body.teams[0].epa).toBeNull();
    expect(body.eventName).toBe("Test Event");
  });

  it("syncs teams, matches, and venue on success", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: "key",
      manualQaRagUrl: "https://rag.test",
    });

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
    const body = (await res.json()) as EventData;
    expect(body.eventKey).toBe("2026test");
    expect(body.teams[0].epa).toBeCloseTo(41.7);
    expect(body.venue?.name).toBe("Some HS");
  });
});
