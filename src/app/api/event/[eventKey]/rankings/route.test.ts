import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventRankingRow } from "@/lib/eventData";
import { GET } from "./route";

interface RankingsBody {
  rankings: EventRankingRow[];
  fetchedAt: number;
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

describe("GET /api/event/[eventKey]/rankings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 400 for an invalid event code", async () => {
    const res = await GET(new Request("http://test"), params("bad key"));
    expect(res.status).toBe(400);
  });

  it("returns 502 when Statbotics responds with a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, 500)));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
  });

  it("returns 502 when the network request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Could not reach Statbotics/);
  });

  it("returns mapped rankings and a fetchedAt timestamp on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse([
          {
            team: 254,
            team_name: "The Cheesy Poofs",
            epa: { total_points: 92.4 },
            record: {
              qual: { wins: 5, losses: 1, ties: 0, rps_per_match: 2.8, rank: 1 },
            },
          },
        ]),
      ),
    );

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RankingsBody;
    expect(body.rankings).toHaveLength(1);
    expect(body.rankings[0].rank).toBe(1);
    expect(typeof body.fetchedAt).toBe("number");
  });

  it("returns an empty list rather than erroring when Statbotics has no data yet", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([])));

    const res = await GET(new Request("http://test"), params("2026test"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as RankingsBody;
    expect(body.rankings).toEqual([]);
  });
});
