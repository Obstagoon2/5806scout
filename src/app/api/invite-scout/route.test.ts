import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/inviteScout", () => ({
  inviteScout: vi.fn(),
  InviteError: class InviteError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

import { InviteError, inviteScout } from "@/lib/inviteScout";
import { POST } from "./route";

const mockInviteScout = vi.mocked(inviteScout);

function req(body: unknown, authHeader?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader !== undefined) headers.authorization = authHeader;
  return new Request("http://test", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /api/invite-scout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when there is no bearer token", async () => {
    const res = await POST(req({ fullName: "A", email: "a@b.com" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when the authorization header isn't a bearer token", async () => {
    const res = await POST(
      req({ fullName: "A", email: "a@b.com" }, "Basic abc123"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await POST(
      new Request("http://test", {
        method: "POST",
        headers: { authorization: "Bearer tok" },
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when name or email is missing", async () => {
    const res = await POST(req({ fullName: "  " }, "Bearer tok"));
    expect(res.status).toBe(400);
    expect(mockInviteScout).not.toHaveBeenCalled();
  });

  it("trims name/email before delegating to inviteScout", async () => {
    mockInviteScout.mockResolvedValue({ email: "a@b.com" });

    const res = await POST(
      req({ fullName: "  Ada  ", email: " a@b.com " }, "Bearer tok"),
    );
    expect(res.status).toBe(200);
    expect(mockInviteScout).toHaveBeenCalledWith("tok", "Ada", "a@b.com");
    const body = (await res.json()) as { invited: string };
    expect(body.invited).toBe("a@b.com");
  });

  it("maps InviteError to its status and message", async () => {
    mockInviteScout.mockRejectedValue(
      new InviteError("Only team admins can add scouts.", 403),
    );

    const res = await POST(
      req({ fullName: "Ada", email: "a@b.com" }, "Bearer tok"),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Only team admins can add scouts.");
  });

  it("returns a generic 500 for unexpected errors", async () => {
    mockInviteScout.mockRejectedValue(new Error("boom"));

    const res = await POST(
      req({ fullName: "Ada", email: "a@b.com" }, "Bearer tok"),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Invite failed — try again.");
  });
});
