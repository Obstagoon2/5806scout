import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventRankingRow } from "@/lib/eventData";
import { GET } from "./route";

vi.mock("@/lib/serverConfig", () => ({
  getServerConfig: vi.fn(),
}));

import { getServerConfig, type ServerConfig } from "@/lib/serverConfig";

const mockGetServerConfig = vi.mocked(getServerConfig);

interface RankingsBody {
  rankings: EventRankingRow[];
  fetchedAt: number;
}

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

const RANKINGS_PAYLOAD = {
  rankings: [
    {
      team_key: "frc254",
      rank: 1,
      record: { wins: 5, losses: 1, ties: 0 },
      matches_played: 6,
      sort_orders: [2.8, 17],
    },
  ],
  sort_order_info: [{ name: "Ranking Score" }, { name: "Total RP" }],
};

const TEAMS_PAYLOAD = [
  { team_number: 254, nickname: "The Cheesy Poofs", city: "San Jose" },
];

/** Route the mock by URL — the handler fetches rankings and teams together. */
function mockTba(rankings: Response, teams: Response = jsonResponse(TEAMS_PAYLOAD)) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL) =>
      String(input).endsWith("/teams/simple") ? teams : rankings,
    );
}

describe("GET /api/event/[eventKey]/rankings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for an invalid event code", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("tba-key"));

    const res = await GET(new Request("http://test"), params("bad key"));
    expect(res.status).toBe(400);
  });

  it("returns 503 when TBA_API_KEY is not configured", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig(null));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain("TBA_API_KEY");
  });

  it("sends the TBA auth header", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("tba-key"));
    const fetchSpy = mockTba(jsonResponse(RANKINGS_PAYLOAD));

    await GET(new Request("http://test"), params("2026test"));

    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).headers as Record<string, string>).toMatchObject(
      { "X-TBA-Auth-Key": "tba-key" },
    );
  });

  it("returns mapped rankings and a fetchedAt timestamp on success", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("tba-key"));
    mockTba(jsonResponse(RANKINGS_PAYLOAD));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RankingsBody;
    expect(body.rankings).toHaveLength(1);
    expect(body.rankings[0]).toMatchObject({
      rank: 1,
      teamNumber: 254,
      teamName: "The Cheesy Poofs",
      rpsPerMatch: 2.8,
      matchesPlayed: 6,
    });
    expect(typeof body.fetchedAt).toBe("number");
  });

  it("still renders rows when the team-name lookup fails", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("tba-key"));
    mockTba(jsonResponse(RANKINGS_PAYLOAD), jsonResponse({}, 500));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RankingsBody;
    expect(body.rankings[0].teamName).toBe("254");
  });

  it("returns an empty list for TBA's pre-quals null body", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("tba-key"));
    mockTba(jsonResponse(null));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as RankingsBody).rankings).toEqual([]);
  });

  it("returns 404 for an unknown event", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("tba-key"));
    mockTba(jsonResponse({}, 404));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(404);
  });

  it("surfaces a rejected API key as a 502", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("bad-key"));
    mockTba(jsonResponse({}, 401));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("TBA_API_KEY");
  });

  it("returns 502 when TBA responds with a server error", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("tba-key"));
    mockTba(jsonResponse({}, 500));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
  });

  it("returns 502 when the network request throws", async () => {
    mockGetServerConfig.mockReturnValue(serverConfig("tba-key"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("boom"));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/Blue Alliance/);
  });
});
