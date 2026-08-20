export type Role = "scout" | "admin";

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  teamId: string;
  role: Role;
  active: boolean;
  /**
   * Whether this account has cleared the email gate (see
   * src/lib/emailVerification.ts). Stamped on the profile by the owner's own
   * session, because a teammate can't read anyone else's Firebase auth
   * record — the roster needs it here or not at all. Absent on profiles
   * written before the field shipped.
   */
  emailVerified?: boolean;
}

export interface Team {
  teamNumber: string;
  teamName: string;
  /**
   * Sister-team link (see src/lib/sisterTeam.ts). Present on both linked
   * teams' docs, pointing at each other; absent when unlinked. Number/name
   * are snapshotted at link time for display without an extra read.
   */
  sisterTeamId?: string;
  sisterTeamNumber?: string;
  sisterTeamName?: string;
  sisterLinkedAt?: number;
}
