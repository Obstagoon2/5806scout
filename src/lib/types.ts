export type Role = "scout" | "admin";

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  teamId: string;
  role: Role;
  active: boolean;
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
