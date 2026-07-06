import { config } from "@/lib/config";

// Verifies a Firebase ID token via Firebase's public Identity Platform REST
// API (accounts:lookup) — the same no-Admin-SDK technique already used in
// src/lib/inviteScout.ts. Routes that proxy paid/rate-limited third-party
// APIs (TBA, Anthropic) call this first so a random visitor can't spend the
// app's quota without at least a signed-in account.

export class AuthError extends Error {
  readonly status = 401;
}

export async function requireUid(req: Request): Promise<string> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!idToken) {
    throw new AuthError("Not signed in.");
  }

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${config.firebase.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  const body = (await res.json().catch(() => null)) as {
    users?: Array<{ localId: string }>;
  } | null;
  const uid = body?.users?.[0]?.localId;
  if (!res.ok || !uid) {
    throw new AuthError("Your session has expired — log in again.");
  }
  return uid;
}
