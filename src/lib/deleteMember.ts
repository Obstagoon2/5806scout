import { config } from "@/lib/config";
import { getAccessToken, readServiceAccount } from "@/lib/googleServiceAccount";

// Permanent removal of a teammate, the counterpart to inviteScout.ts.
//
// "Permanent" is the point: both the Firebase Auth account and the
// users/{uid} profile go, which frees the email address so the person can
// sign up again or be invited back later. Deleting only the profile would
// strand the auth account and leave that email permanently unusable —
// accounts:signUp and the invite flow would both fail with EMAIL_EXISTS.
//
// Deleting another user's auth account is privileged, so unlike inviteScout
// this needs the service account (see googleServiceAccount.ts). The profile
// doc is deleted with that same token, which is why firestore.rules can keep
// `allow delete: if false` on users/{uid} — no client may ever delete a
// profile, only this route acting for a verified admin.

const IDENTITY_BASE = "https://identitytoolkit.googleapis.com/v1";

export class DeleteMemberError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function firestoreDocUrl(uid: string): string {
  // Encoded, not interpolated raw: this URL is handed to a DELETE that runs
  // with service-account credentials outranking firestore.rules, so a uid
  // carrying "/" or ".." must not be able to normalize into another
  // document's path. The route validates the shape too — belt and braces,
  // because the checks that happen to stop it today (the same-team guard,
  // identitytoolkit rejecting a non-uid) are incidental, not a boundary.
  return `https://firestore.googleapis.com/v1/projects/${config.firebase.projectId}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
}

interface MemberProfile {
  role: string;
  teamId: string;
  fullName: string;
}

/** Read a profile with the service account, so one lookup shape works for the
 *  caller and the target alike regardless of what rules would allow. */
async function getProfile(
  uid: string,
  accessToken: string,
): Promise<MemberProfile | null> {
  const res = await fetch(firestoreDocUrl(uid), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new DeleteMemberError("Could not load that member's profile.", 502);
  }
  const doc = (await res.json()) as {
    fields?: {
      role?: { stringValue?: string };
      teamId?: { stringValue?: string };
      fullName?: { stringValue?: string };
    };
  };
  return {
    role: doc.fields?.role?.stringValue ?? "",
    teamId: doc.fields?.teamId?.stringValue ?? "",
    fullName: doc.fields?.fullName?.stringValue ?? "",
  };
}

/** Resolve the caller's ID token to a uid, proving they are who they claim. */
async function resolveCallerUid(idToken: string): Promise<string> {
  const res = await fetch(
    `${IDENTITY_BASE}/accounts:lookup?key=${config.firebase.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) {
    throw new DeleteMemberError("Your session has expired — log in again.", 401);
  }
  const body = (await res.json()) as { users?: Array<{ localId: string }> };
  const uid = body.users?.[0]?.localId;
  if (!uid) {
    throw new DeleteMemberError("Your session has expired — log in again.", 401);
  }
  return uid;
}

export interface DeleteMemberResult {
  fullName: string;
}

export async function deleteMember(
  callerIdToken: string,
  targetUid: string,
): Promise<DeleteMemberResult> {
  const account = readServiceAccount();
  if (!account) {
    throw new DeleteMemberError(
      "Permanent deletion isn't configured on this deployment — set FIREBASE_SERVICE_ACCOUNT_KEY. You can still deactivate the member instead.",
      501,
    );
  }

  const callerUid = await resolveCallerUid(callerIdToken);

  // Checked before anything is read, so a self-delete can't get far enough to
  // matter: the caller is always an admin, so refusing it is also what
  // guarantees a team can never delete its way out of having an admin.
  if (callerUid === targetUid) {
    throw new DeleteMemberError(
      "You can't delete your own account.",
      400,
    );
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken(account);
  } catch {
    throw new DeleteMemberError(
      "Could not authenticate with Firebase — check FIREBASE_SERVICE_ACCOUNT_KEY.",
      502,
    );
  }

  const caller = await getProfile(callerUid, accessToken);
  if (!caller || caller.role !== "admin" || !caller.teamId) {
    throw new DeleteMemberError("Only team admins can delete members.", 403);
  }

  const target = await getProfile(targetUid, accessToken);
  if (!target) {
    throw new DeleteMemberError("That member no longer exists.", 404);
  }
  // Same team only. A sister-team link pools scouting data, not roster
  // authority — each team's admin removes their own people.
  if (target.teamId !== caller.teamId) {
    throw new DeleteMemberError(
      "You can only delete members of your own team.",
      403,
    );
  }

  // Auth account first: while it exists the email stays claimed, so failing
  // here must leave the profile in place rather than stranding a roster entry
  // nobody can log in as — the same ordering rule inviteScout.ts follows.
  const authRes = await fetch(
    `${IDENTITY_BASE}/projects/${config.firebase.projectId}/accounts:delete`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ localId: targetUid }),
    },
  );
  // A 404/USER_NOT_FOUND means the auth account was already gone; the profile
  // still needs clearing, so that isn't an error worth stopping for.
  if (!authRes.ok && authRes.status !== 404) {
    throw new DeleteMemberError(
      "Could not delete that member's login — nothing was changed.",
      502,
    );
  }

  const profileRes = await fetch(firestoreDocUrl(targetUid), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok && profileRes.status !== 404) {
    // The login is already gone, so this can't be rolled back. Say so plainly
    // rather than reporting a clean delete over a half-finished one.
    throw new DeleteMemberError(
      "Their login was deleted but the roster entry could not be removed. Try again, or deactivate the leftover entry.",
      502,
    );
  }

  return { fullName: target.fullName };
}
