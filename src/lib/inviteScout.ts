import { config } from "@/lib/config";

// Server-side scout invites, built on Firebase's public REST APIs so we don't
// need the Admin SDK (and its service-account key). The web API key is enough:
//
//  1. accounts:lookup      — resolve the caller's ID token to a uid.
//  2. Firestore REST GET   — read the caller's own profile (rules allow this)
//     to confirm they're an admin and learn their teamId.
//  3. accounts:signUp      — create the invitee with a random throwaway
//     password they never see.
//  4. Firestore REST       — create users/{uid} for the invitee using the
//     invitee's own ID token (rules: users may create their own profile).
//  5. accounts:sendOobCode — Firebase emails them a password-reset link,
//     which is how they set their real password.

const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1";

export class InviteError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface IdentityErrorBody {
  error?: { message?: string };
}

async function identityCall<T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(
    `${IDENTITY_BASE}/${endpoint}?key=${config.firebase.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as IdentityErrorBody | null;
    const code = err?.error?.message ?? "UNKNOWN";
    if (code.startsWith("EMAIL_EXISTS")) {
      throw new InviteError(
        "An account with that email already exists.",
        409,
      );
    }
    if (code.startsWith("INVALID_EMAIL")) {
      throw new InviteError("That email address is not valid.", 400);
    }
    if (code.startsWith("INVALID_ID_TOKEN") || code.startsWith("USER_NOT_FOUND")) {
      throw new InviteError("Your session has expired — log in again.", 401);
    }
    throw new InviteError(`Invite failed (${code}).`, 502);
  }
  return (await res.json()) as T;
}

function firestoreDocUrl(uid: string): string {
  return `https://firestore.googleapis.com/v1/projects/${config.firebase.projectId}/databases/(default)/documents/users/${uid}`;
}

interface CallerProfile {
  role: string;
  teamId: string;
}

async function getCallerProfile(
  uid: string,
  idToken: string,
): Promise<CallerProfile> {
  const res = await fetch(firestoreDocUrl(uid), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    throw new InviteError("Could not load your profile.", 403);
  }
  const doc = (await res.json()) as {
    fields?: {
      role?: { stringValue?: string };
      teamId?: { stringValue?: string };
    };
  };
  return {
    role: doc.fields?.role?.stringValue ?? "",
    teamId: doc.fields?.teamId?.stringValue ?? "",
  };
}

export interface InviteResult {
  email: string;
}

export async function inviteScout(
  callerIdToken: string,
  fullName: string,
  email: string,
): Promise<InviteResult> {
  const lookup = await identityCall<{ users?: Array<{ localId: string }> }>(
    "accounts:lookup",
    { idToken: callerIdToken },
  );
  const callerUid = lookup.users?.[0]?.localId;
  if (!callerUid) {
    throw new InviteError("Your session has expired — log in again.", 401);
  }

  const caller = await getCallerProfile(callerUid, callerIdToken);
  if (caller.role !== "admin" || !caller.teamId) {
    throw new InviteError("Only team admins can add scouts.", 403);
  }

  // The invitee never sees this password — they set their own via the
  // password-reset email below.
  const throwawayPassword = crypto.randomUUID() + crypto.randomUUID();
  const created = await identityCall<{ localId: string; idToken: string }>(
    "accounts:signUp",
    { email, password: throwawayPassword, returnSecureToken: true },
  );

  // Rules forbid deleting users/{uid} docs, so the auth account is only
  // rolled back for failures BEFORE the profile doc exists — deleting it
  // afterwards would strand a roster entry nobody can log in as.
  try {
    await identityCall("accounts:update", {
      idToken: created.idToken,
      displayName: fullName,
      returnSecureToken: false,
    });

    const profileRes = await fetch(
      `${firestoreDocUrl(created.localId)}?currentDocument.exists=false`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${created.idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: {
            email: { stringValue: email },
            fullName: { stringValue: fullName },
            teamId: { stringValue: caller.teamId },
            role: { stringValue: "scout" },
            active: { booleanValue: true },
            // An invited address is still just an address someone typed, so
            // it starts unverified and stays off the roster (showsInRoster)
            // until the invitee proves the inbox is theirs by following the
            // password-reset link below. Their first sign-in stamps it true.
            emailVerified: { booleanValue: false },
            createdAt: { timestampValue: new Date().toISOString() },
          },
        }),
      },
    );
    if (!profileRes.ok) {
      throw new InviteError("Could not create the scout's profile.", 502);
    }
  } catch (err) {
    await identityCall("accounts:delete", { idToken: created.idToken }).catch(
      () => undefined,
    );
    throw err;
  }

  try {
    await identityCall("accounts:sendOobCode", {
      requestType: "PASSWORD_RESET",
      email,
    });
  } catch {
    // Account + profile exist; only the email failed. Don't roll back —
    // they can still use "reset password" on the login page.
    throw new InviteError(
      "The account was created but the invite email failed to send. Ask them to use the password reset option when logging in.",
      502,
    );
  }

  return { email };
}
