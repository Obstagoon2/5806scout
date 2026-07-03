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
}
