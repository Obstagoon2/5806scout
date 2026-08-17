import { afterEach, describe, expect, it, vi } from "vitest";
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

describe("GET /api/event/[eventKey]/live", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 when TBA_API_KEY is not configured", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig(null));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(503);
  });

  it("returns 400 for an invalid event code", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));

    const res = await GET(new Request("http://test"), params("../etc"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the event isn't found", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 404)));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(404);
  });

  it("returns 502 on a non-ok TBA response", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
  });

  it("returns 502 when the network request throws", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
  });

  it("returns mapped matches and a fetchedAt timestamp on success", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("key"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            key: "2026test_qm1",
            comp_level: "qm",
            match_number: 1,
            alliances: {
              red: { team_keys: ["frc254"], score: -1 },
              blue: { team_keys: ["frc1"], score: -1 },
            },
            winning_alliance: "",
            time: null,
            predicted_time: null,
          },
        ]),
      ),
    );

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { matches: unknown[]; fetchedAt: number };
    expect(body.matches).toHaveLength(1);
    expect(typeof body.fetchedAt).toBe("number");
  });
});
