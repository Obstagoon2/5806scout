// Firestore operations for sister-team linking. Pure decision logic lives in
// sisterTeam.ts; this file does the reads/writes. Everything runs client-side
// as the signed-in admin — firestore.rules enforces that links are mutual,
// invite-authorized, and that config/picklist never crosses teams.

import { db } from "@/lib/firebase/client";
import {
  canonicalDataTeamId,
  generateInviteCode,
  INVITE_TTL_MS,
  inviteRedemptionError,
  normalizeInviteCode,
  type SisterInviteDoc,
} from "@/lib/sisterTeam";
import type { Team } from "@/lib/types";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from "firebase/firestore";

/**
 * Subcollections copied between the pair's stores on link/unlink so neither
 * team loses data. config is handled separately (picklist stays home).
 */
const SHARED_COLLECTIONS = ["pitScouting", "matchScouting", "talkie"] as const;
const PRIVATE_CONFIG_DOCS = new Set(["picklist"]);

// Firestore caps a WriteBatch at 500 operations.
const BATCH_LIMIT = 450;

/**
 * Create a one-time invite code for this team and return it. Rules only
 * allow creating a sisterInvites doc that doesn't exist, so a collision
 * surfaces as a permission error — retry with a fresh code.
 */
export async function createSisterInvite(args: {
  teamId: string;
  team: Team;
  uid: string;
}): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateInviteCode();
    const invite: SisterInviteDoc = {
      fromTeamId: args.teamId,
      fromTeamNumber: args.team.teamNumber,
      fromTeamName: args.team.teamName,
      createdByUid: args.uid,
      createdAt: Date.now(),
      expiresAt: Date.now() + INVITE_TTL_MS,
    };
    try {
      await setDoc(doc(db, "sisterInvites", code), invite);
      return code;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not create a link code — check your connection.");
}

/**
 * Redeem a sister team's invite code: stamp the mutual link on both team
 * docs and consume the code, all in one atomic batch, then fold the
 * non-canonical team's pre-link data into the shared store so nothing
 * either team already scouted disappears. Throws with a human-readable
 * message when the code can't be redeemed.
 */
export async function redeemSisterInvite(args: {
  code: string;
  myTeamId: string;
  myTeam: Team;
}): Promise<{ sisterTeamId: string }> {
  const code = normalizeInviteCode(args.code);
  const inviteSnap = code
    ? await getDoc(doc(db, "sisterInvites", code))
    : null;
  const invite = inviteSnap?.exists()
    ? (inviteSnap.data() as SisterInviteDoc)
    : null;

  let fromTeam: Team | null = null;
  if (invite) {
    const fromSnap = await getDoc(doc(db, "teams", invite.fromTeamId));
    fromTeam = fromSnap.exists() ? (fromSnap.data() as Team) : null;
  }

  const error = inviteRedemptionError({
    invite,
    now: Date.now(),
    myTeamId: args.myTeamId,
    mySisterTeamId: args.myTeam.sisterTeamId ?? null,
    fromTeamSisterId: fromTeam?.sisterTeamId ?? null,
  });
  if (error || !invite) throw new Error(error ?? "Invalid code.");

  const linkedAt = Date.now();
  const batch = writeBatch(db);
  // The other team's half: rules verify the presented sisterLinkCode against
  // the live sisterInvites doc before letting us touch their doc.
  batch.update(doc(db, "teams", invite.fromTeamId), {
    sisterTeamId: args.myTeamId,
    sisterTeamNumber: args.myTeam.teamNumber,
    sisterTeamName: args.myTeam.teamName,
    sisterLinkedAt: linkedAt,
    sisterLinkCode: code,
  });
  batch.update(doc(db, "teams", args.myTeamId), {
    sisterTeamId: invite.fromTeamId,
    sisterTeamNumber: invite.fromTeamNumber,
    sisterTeamName: invite.fromTeamName,
    sisterLinkedAt: linkedAt,
  });
  batch.delete(doc(db, "sisterInvites", code));
  await batch.commit();

  const canonical = canonicalDataTeamId(args.myTeamId, invite.fromTeamId);
  const other =
    canonical === args.myTeamId ? invite.fromTeamId : args.myTeamId;
  await copySharedData(other, canonical, { overwriteConfig: false });
  return { sisterTeamId: invite.fromTeamId };
}

/**
 * Sever the link from either side. While cross-team access still exists,
 * copy the shared store to the non-canonical team so both walk away with
 * everything the pair collected; then clear the link fields on both docs
 * atomically.
 */
export async function unlinkSisterTeam(args: {
  myTeamId: string;
  myTeam: Team;
}): Promise<void> {
  const sisterTeamId = args.myTeam.sisterTeamId;
  if (!sisterTeamId) return;

  const canonical = canonicalDataTeamId(args.myTeamId, sisterTeamId);
  const other = canonical === args.myTeamId ? sisterTeamId : args.myTeamId;
  await copySharedData(canonical, other, { overwriteConfig: true });

  const cleared = {
    sisterTeamId: deleteField(),
    sisterTeamNumber: deleteField(),
    sisterTeamName: deleteField(),
    sisterLinkedAt: deleteField(),
    sisterLinkCode: deleteField(),
  };
  const batch = writeBatch(db);
  batch.update(doc(db, "teams", args.myTeamId), cleared);
  batch.update(doc(db, "teams", sisterTeamId), cleared);
  await batch.commit();
}

/**
 * Copy one team's shared data into the other's store. Subcollection docs
 * only fill gaps (ids never clash across the pair except pitScouting, where
 * the destination's version wins). Config docs fill gaps on link; on unlink
 * they overwrite so the departing team leaves with the pair's live event,
 * assignments, and pit state — never the picklist.
 */
async function copySharedData(
  fromTeamId: string,
  toTeamId: string,
  opts: { overwriteConfig: boolean },
): Promise<void> {
  for (const name of SHARED_COLLECTIONS) {
    const [src, dst] = await Promise.all([
      getDocs(collection(db, "teams", fromTeamId, name)),
      getDocs(collection(db, "teams", toTeamId, name)),
    ]);
    const have = new Set(dst.docs.map((d) => d.id));
    const missing = src.docs.filter((d) => !have.has(d.id));
    for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
      const batch = writeBatch(db);
      for (const d of missing.slice(i, i + BATCH_LIMIT)) {
        batch.set(doc(db, "teams", toTeamId, name, d.id), d.data());
      }
      await batch.commit();
    }
  }

  const [srcConfig, dstConfig] = await Promise.all([
    getDocs(collection(db, "teams", fromTeamId, "config")),
    getDocs(collection(db, "teams", toTeamId, "config")),
  ]);
  const haveConfig = new Set(dstConfig.docs.map((d) => d.id));
  const toCopy = srcConfig.docs.filter(
    (d) =>
      !PRIVATE_CONFIG_DOCS.has(d.id) &&
      (opts.overwriteConfig || !haveConfig.has(d.id)),
  );
  if (toCopy.length > 0) {
    const batch = writeBatch(db);
    for (const d of toCopy) {
      batch.set(doc(db, "teams", toTeamId, "config", d.id), d.data());
    }
    await batch.commit();
  }
}
