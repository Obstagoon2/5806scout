"use client";

import { auth, db } from "@/lib/firebase/client";
import type { UserProfile } from "@/lib/types";
import { type User, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, updateDoc } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
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

  useEffect(() => {
    // Self-heal: teams created before the one-admin-per-team feature shipped
    // never got teams/{teamId}.adminUid backfilled. The rules let any admin
    // freely edit their own team doc, so the first admin to load the app
    // after this ships claims the slot retroactively — closing the gap that
    // let a second admin sign up for teams the app didn't know had one yet.
    if (!user || !profile || profile.role !== "admin") return;

    const teamRef = doc(db, "teams", profile.teamId);
    void getDoc(teamRef).then((snap) => {
      if (snap.exists() && !snap.data().adminUid) {
        void updateDoc(teamRef, { adminUid: user.uid }).catch(() => {});
      }
    });
  }, [user, profile]);

  const loading = authLoading || profileLoading;

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
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
