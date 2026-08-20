// Who has to prove they own the email address they typed.
//
// Signup is open — anyone who knows a team number can join it — so the only
// thing standing between a team's scouting data and a stranger is that the
// address is real and theirs. Firebase's verification email is that proof.
//
// Two carve-outs, both because the proof already exists:
//
//  - Federated sign-in (Google) hands us an address the provider already
//    verified, so there is nothing left to check.
//  - Accounts created before the gate shipped are grandfathered in. Locking
//    an existing roster out mid-season to collect a click nobody warned them
//    about would cost more than it buys.

/** The `providerId` Firebase gives an email + password account. */
const PASSWORD_PROVIDER_ID = "password";

/**
 * Accounts created at or after this instant must verify. Bump it only to
 * re-run the gate over everyone; moving it earlier retroactively locks out
 * accounts that were grandfathered in.
 */
export const VERIFICATION_REQUIRED_FROM = Date.parse("2026-08-19T00:00:00Z");

/** The slice of a Firebase `User` this decision reads. */
export interface VerifiableUser {
  emailVerified: boolean;
  providerData: readonly { providerId: string }[];
  metadata: { creationTime?: string };
}

/** Should this user be held at the "check your inbox" screen? */
export function needsEmailVerification(user: VerifiableUser): boolean {
  if (user.emailVerified) return false;

  // Only a typed-in address is unproven. An account with no password provider
  // got its address from somewhere that already vouched for it.
  const hasPassword = user.providerData.some(
    (p) => p.providerId === PASSWORD_PROVIDER_ID,
  );
  if (!hasPassword) return false;

  // An unparseable creationTime means we can't tell how old the account is.
  // Treat that like an old account: a missing timestamp is a bad reason to
  // lock a scout out at an event.
  const createdAt = Date.parse(user.metadata.creationTime ?? "");
  if (!Number.isFinite(createdAt)) return false;

  return createdAt >= VERIFICATION_REQUIRED_FROM;
}

/** The slice of a profile roster visibility reads. */
export interface RosterCandidate {
  emailVerified?: boolean;
}

/**
 * Should this teammate appear on the roster?
 *
 * The roster can't ask Firebase whether someone else verified — auth records
 * are private to their owner — so it reads the flag each session stamps on its
 * own `users/{uid}` doc. That makes the answer only as fresh as the member's
 * last sign-in, which is the right trade: someone who has never come back to
 * click the link is exactly who this hides.
 *
 * A missing flag means the doc predates the stamp, and those accounts stay
 * visible for the same reason `needsEmailVerification` grandfathers them —
 * emptying a mid-season roster to collect a click nobody was warned about
 * costs more than it buys.
 */
export function showsInRoster(member: RosterCandidate): boolean {
  return member.emailVerified !== false;
}
