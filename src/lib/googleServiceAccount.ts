import { createSign } from "node:crypto";

// Google service-account access tokens, minted from a self-signed JWT via the
// OAuth2 "jwt-bearer" flow. Hand-rolled on fetch + node:crypto rather than
// pulling in firebase-admin, matching how inviteScout.ts talks to Firebase
// over its public REST APIs.
//
// This is the one credential in the app that outranks firestore.rules, so it
// is only ever used by routes that have already checked the caller is a team
// admin — never as a general-purpose "skip the rules" escape hatch.

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** identitytoolkit deletes the auth account; datastore deletes the profile. */
const SCOPES = [
  "https://www.googleapis.com/auth/identitytoolkit",
  "https://www.googleapis.com/auth/datastore",
].join(" ");

/** Refresh a minute early so a token can't expire mid-request. */
const EXPIRY_SKEW_SECONDS = 60;

export interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * The service-account JSON from env, or null when it isn't configured — the
 * caller turns that into a clear setup message instead of a crash, the same
 * way getServerConfig() treats its optional keys.
 *
 * Accepts the raw JSON or a base64 blob of it: pasting multi-line JSON into a
 * hosting dashboard's env field mangles the newlines inside private_key, and
 * base64 is the usual way round that.
 */
export function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (!raw) return null;

  let parsed: { client_email?: string; private_key?: string };
  try {
    const json = raw.startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    return null;
  }

  const clientEmail = parsed.client_email;
  const privateKey = parsed.private_key;
  if (!clientEmail || !privateKey) return null;

  return {
    clientEmail,
    // Survives the key being stored with escaped newlines (JSON-in-a-string).
    privateKey: privateKey.includes("\\n")
      ? privateKey.replace(/\\n/g, "\n")
      : privateKey,
  };
}

let cached: { token: string; expiresAt: number } | null = null;

function signAssertion(account: ServiceAccount, issuedAt: number): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: account.clientEmail,
      scope: SCOPES,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${base64url(signer.sign(account.privateKey))}`;
}

/**
 * A bearer token for the service account, reused until it is close to expiry.
 * Throws when the exchange fails so callers surface a real error rather than
 * making an unauthenticated request that would fail confusingly later.
 */
export async function getAccessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt - EXPIRY_SKEW_SECONDS > now) {
    return cached.token;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signAssertion(account, now),
    }),
  });
  if (!res.ok) {
    throw new Error(`Service-account token exchange failed (${res.status}).`);
  }

  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!body.access_token) {
    throw new Error("Service-account token exchange returned no token.");
  }

  cached = {
    token: body.access_token,
    expiresAt: now + (body.expires_in ?? 3600),
  };
  return cached.token;
}

/** Test seam — the module-level token cache outlives a single test otherwise. */
export function resetAccessTokenCache(): void {
  cached = null;
}
