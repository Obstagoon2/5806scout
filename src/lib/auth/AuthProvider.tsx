"use client";

import { auth, db } from "@/lib/firebase/client";
import { canonicalDataTeamId } from "@/lib/sisterTeam";
import type { Team, UserProfile } from "@/lib/types";
import { type User, onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  /** Own team doc, including sister-link fields. Null until loaded. */
  team: Team | null;
  /**
   * Where shared scouting data lives: the canonical store for a linked
   * sister pair (see src/lib/sisterTeam.ts), or the team's own id when
   * unlinked. Null until the profile and team doc resolve. The picklist is
   * the one thing that must keep using profile.teamId instead.
   */
  dataTeamId: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // Tagged with the teamId it came from so a stale snapshot (after switching
  // accounts) is ignored at render time instead of reset via effect.
  const [teamState, setTeamState] = useState<{
    teamId: string;
    team: Team | null;
  } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthLoading(false);
      if (nextUser) {
        setProfileLoading(true);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;

    return onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      const data = snapshot.data();
      setProfile(data ? ({ uid: user.uid, ...data } as UserProfile) : null);
      setProfileLoading(false);
    });
  }, [user]);

  // The team doc rides along with the profile so every page knows the
  // sister-link state (and therefore where shared data lives) without its
  // own subscription.
  useEffect(() => {
    const teamId = profile?.teamId;
    if (!teamId) return;
    return onSnapshot(doc(db, "teams", teamId), (snapshot) => {
      setTeamState({
        teamId,
        team: snapshot.exists() ? (snapshot.data() as Team) : null,
      });
    });
  }, [profile?.teamId]);

  const teamLoaded = !profile || teamState?.teamId === profile.teamId;
  const team = profile && teamLoaded ? (teamState?.team ?? null) : null;
  const loading = authLoading || profileLoading || !teamLoaded;
  const dataTeamId = profile
    ? canonicalDataTeamId(profile.teamId, team?.sisterTeamId)
    : null;

  return (
    <AuthContext.Provider value={{ user, profile, team, dataTeamId, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
