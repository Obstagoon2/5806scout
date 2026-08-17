import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/serverConfig", () => ({
  getServerConfig: vi.fn(),
}));

import { getServerConfig, type ServerConfig } from "@/lib/serverConfig";

const mockGetServerConfig = vi.mocked(getServerConfig);

function serverConfig(nexusApiKey: string | null): ServerConfig {
  return {
    tbaApiKey: "tba-key",
    nexusApiKey,
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

const MAP_PAYLOAD = {
  size: { x: 200, y: 100 },
  pits: { A1: { position: { x: 10, y: 10 }, size: { x: 20, y: 20 } } },
};

/** Route the mock by URL — the handler fetches /map and /pits concurrently. */
function mockNexus(map: Response, pits: Response) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL) =>
      String(input).endsWith("/pits") ? pits : map,
    );
}

describe("GET /api/event/[eventKey]/pit-map", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 with setup instructions when NEXUS_API_KEY is missing", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig(null));

    const res = await GET(new Request("http://test"), params("2026test"));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("NEXUS_API_KEY");
  });

  it("rejects a malformed event code before calling Nexus", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await GET(new Request("http://test"), params("2026 test"));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps the map and fills pit teams from the address directory", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    mockNexus(jsonResponse(MAP_PAYLOAD), jsonResponse({ "5806": "A1" }));

    const body = await (
      await GET(new Request("http://test"), params("2026test"))
    ).json();

    expect(body.map.width).toBe(200);
    expect(body.map.pits[0].label).toBe("5806");
    expect(body.addresses).toEqual({ "5806": "A1" });
  });

  it("still returns addresses when the event has no drawn map", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    mockNexus(jsonResponse({}, 404), jsonResponse({ "5806": "A1" }));

    const res = await GET(new Request("http://test"), params("2026test"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.map).toBeNull();
    expect(body.addresses).toEqual({ "5806": "A1" });
  });

  it("returns an empty result when Nexus has nothing for the event", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    mockNexus(jsonResponse({}, 404), jsonResponse({}, 404));

    const res = await GET(new Request("http://test"), params("2026test"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.map).toBeNull();
    expect(body.addresses).toEqual({});
  });

  it("surfaces a real upstream failure rather than an empty map", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    mockNexus(jsonResponse({}, 500), jsonResponse({}, 500));

    const res = await GET(new Request("http://test"), params("2026test"));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Nexus");
  });
});
