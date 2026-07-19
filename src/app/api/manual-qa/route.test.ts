import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/serverConfig", () => ({
  getServerConfig: vi.fn(),
}));

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  class MockAnthropicError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  }
  class MockAnthropic {
    messages = { create: mockCreate };
    static APIError = MockAnthropicError;
  }
  return { default: MockAnthropic };
});

import { getServerConfig } from "@/lib/serverConfig";
import Anthropic from "@anthropic-ai/sdk";
import { GET, POST } from "./route";

const mockGetServerConfig = vi.mocked(getServerConfig);

function req(body: unknown): Request {
  return new Request("http://test", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("GET /api/manual-qa", () => {
  it("reports readiness and chunk count", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.ready).toBe(true);
    expect(body.chunkCount).toBeGreaterThan(0);
  });
});

describe("POST /api/manual-qa", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: null,
      manualQaModel: "test-model",
    });

    const res = await POST(req({ question: "what is G301?" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for an invalid request body", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: "key",
      manualQaModel: "test-model",
    });

    const res = await POST(
      new Request("http://test", { method: "POST", body: "not json" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the question is missing", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: "key",
      manualQaModel: "test-model",
    });

    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the question exceeds the max length", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: "key",
      manualQaModel: "test-model",
    });

    const res = await POST(req({ question: "a".repeat(1001) }));
    expect(res.status).toBe(400);
  });

  it("returns a no-match answer with no citations when nothing overlaps", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: "key",
      manualQaModel: "test-model",
    });

    const res = await POST(req({ question: "zzz qqq nonsense" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.citations).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns a refusal-safe answer when Claude refuses", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: "key",
      manualQaModel: "test-model",
    });
    mockCreate.mockResolvedValue({ stop_reason: "refusal", content: [] });

    const res = await POST(req({ question: "robot frame perimeter rule" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toBe("I can't answer that question.");
    expect(body.citations).toEqual([]);
  });

  it("returns the answer text and citation ids on success", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: "key",
      manualQaModel: "test-model",
    });
    mockCreate.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "The frame perimeter is 120 inches [1]." }],
    });

    const res = await POST(req({ question: "robot frame perimeter rule" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toContain("frame perimeter");
    expect(body.citations.length).toBeGreaterThan(0);
  });

  it("returns 502 when the Claude API call fails", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: "key",
      manualQaModel: "test-model",
    });
    mockCreate.mockRejectedValue(
      new Anthropic.APIError("rate limited", 429),
    );

    const res = await POST(req({ question: "robot frame perimeter rule" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Claude API error/);
  });

  it("returns a generic 502 for a non-APIError failure (e.g. network error)", async () => {
    mockGetServerConfig.mockReturnValue({
      tbaApiKey: null,
      anthropicApiKey: "key",
      manualQaModel: "test-model",
    });
    mockCreate.mockRejectedValue(new Error("ECONNRESET"));

    const res = await POST(req({ question: "robot frame perimeter rule" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Could not reach the Claude API/);
  });
});
