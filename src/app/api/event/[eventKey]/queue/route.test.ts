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

function request(query = ""): Request {
  return new Request(`http://test/api/event/2026test/queue${query}`);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/event/[eventKey]/queue", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 with setup instructions when NEXUS_API_KEY is missing", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig(null));

    const res = await GET(request(), params("2026test"));

    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("NEXUS_API_KEY");
  });

  it("rejects a malformed event code before calling Nexus", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await GET(request(), params("../secrets"));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric team number", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));

    const res = await GET(request("?team=frc5806"), params("2026test"));

    expect(res.status).toBe(400);
  });

  it("sends the API key and returns the selected queue status", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        eventKey: "2026test",
        dataAsOfTime: 42,
        nowQueuing: "Qualification 3",
        matches: [
          { label: "Qualification 2", status: "On field", redTeams: [], blueTeams: [] },
          {
            label: "Qualification 3",
            status: "Now queuing",
            redTeams: ["5806"],
            blueTeams: [],
          },
        ],
      }),
    );

    const res = await GET(request("?team=5806"), params("2026test"));
    const body = await res.json();

    expect(res.status).toBe(200);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://frc.nexus/api/v1/event/2026test");
    expect(
      (init as RequestInit).headers as Record<string, string>,
    ).toMatchObject({ "Nexus-Api-Key": "nexus-key" });
    expect(body.status.nowQueuing).toBe("Qualification 3");
    expect(body.status.onField.label).toBe("Qualification 2");
    expect(body.status.ourNext.label).toBe("Qualification 3");
  });

  it("treats a 404 as 'this event isn't on Nexus', not an error", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 404));

    const res = await GET(request(), params("2026test"));

    expect(res.status).toBe(200);
    expect((await res.json()).status).toBeNull();
  });

  it("surfaces a rejected API key as a 502 the UI can show", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("bad-key"));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 401));

    const res = await GET(request(), params("2026test"));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("NEXUS_API_KEY");
  });

  it("reports a network failure instead of throwing", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("nexus-key"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));

    const res = await GET(request(), params("2026test"));

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Nexus");
  });
});
