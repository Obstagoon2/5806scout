// Resolve a Firebase ID token to the uid that owns it, server-side.
//
// Routes that spend money or touch privileged data can't take the client's
// word for who is calling. inviteScout and deleteMember already do this as
// part of their own flows; this is the same accounts:lookup call for routes
// that only need "is this a signed-in member of this app" and nothing more.

import { config } from "@/lib/config";

const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1";

/** The caller's uid, or null when the token is missing, expired or bogus. */
export async function uidFromIdToken(
  idToken: string | null,
): Promise<string | null> {
  if (!idToken) return null;
  try {
    const res = await fetch(
      `${IDENTITY_BASE}/accounts:lookup?key=${config.firebase.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      users?: Array<{ localId?: string }>;
    };
    return body.users?.[0]?.localId ?? null;
  } catch {
    // Treated as unauthenticated rather than thrown: a caller who can't be
    // identified must not be served, but the reason isn't theirs to see.
    return null;
  }
}

/** The bearer token on a request, or null when there isn't one. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ")
    ? header.slice("Bearer ".length) || null
    : null;
}
