import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/serverConfig", () => ({
  getServerConfig: vi.fn(),
}));

import { getServerConfig } from "@/lib/serverConfig";
import { GET, POST } from "./route";

const mockGetServerConfig = vi.mocked(getServerConfig);
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const CONFIG = {
  tbaApiKey: null,
  manualQaRagUrl: "https://rag.test",
  cfAccountId: "acct-test",
  cfAiSearchInstance: "game-manual-2026",
  // No token -> the in-app AI Search path is skipped and these tests exercise
  // the worker fallback (the same external contract they always covered).
  cfAiSearchToken: null,
};

function req(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function ragResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/manual-qa", () => {
  it("reports ready with the vector count once indexing completed", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);
    mockFetch.mockResolvedValue(
      ragResponse({
        completed: 2,
        engine: { vectorize: { vectorsCount: 127 } },
      }),
    );

    const res = await GET();
    const body = await res.json();
    expect(mockFetch).toHaveBeenCalledWith(
      "https://rag.test/api/status",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(body).toEqual({ ready: true, chunkCount: 127 });
  });

  it("reports not ready when nothing is indexed yet", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);
    mockFetch.mockResolvedValue(ragResponse({ completed: 0 }));

    const body = await (await GET()).json();
    expect(body).toEqual({ ready: false, chunkCount: 0 });
  });

  it("reports not ready when the worker is unreachable", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);
    mockFetch.mockRejectedValue(new Error("ECONNRESET"));

    const body = await (await GET()).json();
    expect(body).toEqual({ ready: false, chunkCount: 0 });
  });
});

describe("POST /api/manual-qa", () => {
  it("returns 400 for an invalid request body", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);

    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when the question is missing", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);

    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the question exceeds the max length", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);

    const res = await POST(req({ question: "a".repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it("returns the answer and sources on success", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);
    mockFetch.mockResolvedValue(
      ragResponse({
        answer: "The frame perimeter is 120 inches (R104).",
        sources: [{ file: "manual.pdf", score: 0.6, excerpt: "R104…" }],
      }),
    );

    const res = await POST(req({ question: "frame perimeter rule" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { answer: string; sources: unknown[] };
    expect(body.answer).toContain("frame perimeter");
    expect(body.sources).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://rag.test/api/ask",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns a generic 502 when the worker responds with an error", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);
    mockFetch.mockResolvedValue(
      ragResponse({ error: "AI Search request failed: timeout" }, 502),
    );

    const res = await POST(req({ question: "pinning penalty" }));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    // The fallback treats any non-ok worker response as unreachable and
    // surfaces one consistent message rather than the upstream's wording.
    expect(body.error).toMatch(/Could not reach the manual assistant/);
  });

  it("returns a generic 502 when the worker is unreachable", async () => {
    mockGetServerConfig.mockReturnValue(CONFIG);
    mockFetch.mockRejectedValue(new Error("ECONNRESET"));

    const res = await POST(req({ question: "pinning penalty" }));
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Could not reach the manual assistant/);
  });
});
