// Sister-team linking: two FRC teams pair up, split the scouting workload,
// and share everything except their picklists. All shared data (pit/match
// scouting, talkie, event config, assignments) lives in a single canonical
// store — the pair's lower team number's teams/{teamId} subtree — while each
// team keeps its own private config/picklist. A link is authorized by a
// one-time invite code doc at sisterInvites/{code}: one team's admin
// generates it, the other team's admin redeems it, so both sides consent.
// Pure decision logic lives here (testable); Firestore ops are in
// sisterTeamOps.ts.

export interface SisterInviteDoc {
  fromTeamId: string;
  fromTeamNumber: string;
  fromTeamName: string;
  createdByUid: string;
  createdAt: number;
  expiresAt: number;
}

export const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const INVITE_CODE_LENGTH = 8;

// No 0/O/1/I/L — codes get read out loud between two pits.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateInviteCode(rng: () => number = Math.random): string {
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercase and strip separators so "ab2c-d3ef" matches "AB2CD3EF". */
export function normalizeInviteCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * The teamId whose subtree holds the pair's shared data: the numerically
 * lower team number (lexicographic for non-numeric ids), or the team itself
 * when unlinked. Both sides compute the same answer with no coordination.
 */
export function canonicalDataTeamId(
  ownTeamId: string,
  sisterTeamId?: string | null,
): string {
  if (!sisterTeamId || sisterTeamId === ownTeamId) return ownTeamId;
  const own = Number(ownTeamId);
  const sister = Number(sisterTeamId);
  if (Number.isFinite(own) && Number.isFinite(sister) && own !== sister) {
    return own < sister ? ownTeamId : sisterTeamId;
  }
  return ownTeamId < sisterTeamId ? ownTeamId : sisterTeamId;
}

/**
 * Why redeeming this invite can't proceed, or null if it can. `invite` is
 * null when the code doc doesn't exist — never issued, or already redeemed
 * (redemption deletes it).
 */
export function inviteRedemptionError(args: {
  invite: SisterInviteDoc | null;
  now: number;
  myTeamId: string;
  mySisterTeamId?: string | null;
  fromTeamSisterId?: string | null;
}): string | null {
  const { invite, now, myTeamId, mySisterTeamId, fromTeamSisterId } = args;
  if (!invite) return "That code doesn't exist or was already used.";
  if (now > invite.expiresAt) {
    return "That code has expired — ask their admin to generate a new one.";
  }
  if (invite.fromTeamId === myTeamId) {
    return "That's your own team's code — share it with your sister team instead.";
  }
  if (mySisterTeamId) {
    return "Your team is already linked to a sister team — unlink first.";
  }
  if (fromTeamSisterId) {
    return `Team ${invite.fromTeamNumber} is already linked to another team.`;
  }
  return null;
}
