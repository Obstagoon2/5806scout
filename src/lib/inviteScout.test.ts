import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  config: {
    firebase: {
      apiKey: "test-api-key",
      projectId: "test-project",
      authDomain: "test.firebaseapp.com",
      storageBucket: "test.appspot.com",
      messagingSenderId: "1",
      appId: "1:1:web:1",
    },
  },
}));

import { InviteError, inviteScout } from "./inviteScout";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

/** Builds a fetch mock that dispatches on the identitytoolkit `endpoint`
 *  segment or on the Firestore REST doc URL, matching inviteScout.ts's
 *  actual call sequence. */
function mockFetchSequence(
  handlers: Partial<{
    lookup: () => Response;
    getProfile: () => Response;
    signUp: () => Response;
    update: () => Response;
    createProfile: () => Response;
    sendOobCode: () => Response;
    deleteAccount: () => Response;
  }>,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    if (url.includes("accounts:lookup")) {
      return handlers.lookup?.() ?? jsonResponse({ users: [{ localId: "caller-uid" }] });
    }
    if (url.includes("accounts:signUp")) {
      return (
        handlers.signUp?.() ??
        jsonResponse({ localId: "new-uid", idToken: "new-id-token" })
      );
    }
    if (url.includes("accounts:update")) {
      return handlers.update?.() ?? jsonResponse({});
    }
    if (url.includes("accounts:sendOobCode")) {
      return handlers.sendOobCode?.() ?? jsonResponse({});
    }
    if (url.includes("accounts:delete")) {
      return handlers.deleteAccount?.() ?? jsonResponse({});
    }
    if (url.includes("firestore.googleapis.com")) {
      if (init?.method === "PATCH") {
        return handlers.createProfile?.() ?? jsonResponse({});
      }
      return handlers.getProfile?.() ?? jsonResponse({
        fields: {
          role: { stringValue: "admin" },
          teamId: { stringValue: "team-1" },
        },
      });
    }
    throw new Error(`Unexpected fetch: ${url} ${JSON.stringify(body)}`);
  });
}

describe("inviteScout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the scout end-to-end and returns their email", async () => {
    vi.stubGlobal("fetch", mockFetchSequence({}));

    const result = await inviteScout("caller-token", "Ada Lovelace", "ada@team.org");
    expect(result).toEqual({ email: "ada@team.org" });
  });

  it("throws 401 when the caller's ID token doesn't resolve to a user", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({ lookup: () => jsonResponse({ users: [] }) }),
    );

    await expect(
      inviteScout("bad-token", "Ada", "ada@team.org"),
    ).rejects.toMatchObject({ status: 401 } satisfies Partial<InviteError>);
  });

  it("throws 403 when the caller is not an admin", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        getProfile: () =>
          jsonResponse({
            fields: {
              role: { stringValue: "scout" },
              teamId: { stringValue: "team-1" },
            },
          }),
      }),
    );

    await expect(
      inviteScout("caller-token", "Ada", "ada@team.org"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when the caller has no teamId", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        getProfile: () =>
          jsonResponse({ fields: { role: { stringValue: "admin" } } }),
      }),
    );

    await expect(
      inviteScout("caller-token", "Ada", "ada@team.org"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 409 when the email already has an account", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        signUp: () =>
          jsonResponse({ error: { message: "EMAIL_EXISTS" } }, false, 400),
      }),
    );

    await expect(
      inviteScout("caller-token", "Ada", "ada@team.org"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("throws 400 for an invalid email", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        signUp: () =>
          jsonResponse({ error: { message: "INVALID_EMAIL" } }, false, 400),
      }),
    );

    await expect(
      inviteScout("caller-token", "Ada", "not-an-email"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rolls back the created auth account when profile creation fails", async () => {
    const deleteAccount = vi.fn(() => jsonResponse({}));
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        createProfile: () => jsonResponse({}, false, 500),
        deleteAccount,
      }),
    );

    await expect(
      inviteScout("caller-token", "Ada", "ada@team.org"),
    ).rejects.toMatchObject({ status: 502 });
    expect(deleteAccount).toHaveBeenCalled();
  });

  it("does not roll back the account when only the invite email fails to send", async () => {
    const deleteAccount = vi.fn(() => jsonResponse({}));
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        sendOobCode: () => jsonResponse({}, false, 500),
        deleteAccount,
      }),
    );

    await expect(
      inviteScout("caller-token", "Ada", "ada@team.org"),
    ).rejects.toThrow(/invite email failed to send/);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("swallows rollback failures and still surfaces the original error", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        createProfile: () => jsonResponse({}, false, 500),
        deleteAccount: () => jsonResponse({ error: { message: "UNKNOWN" } }, false, 500),
      }),
    );

    await expect(
      inviteScout("caller-token", "Ada", "ada@team.org"),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("throws 401 when the caller's session has expired mid-flow", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchSequence({
        lookup: () =>
          jsonResponse(
            { error: { message: "INVALID_ID_TOKEN" } },
            false,
            400,
          ),
      }),
    );

    await expect(
      inviteScout("expired-token", "Ada", "ada@team.org"),
    ).rejects.toMatchObject({ status: 401 });
  });
});
