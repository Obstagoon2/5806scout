"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LionMark } from "@/components/LionMark";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/home" : "/login");
  }, [user, loading, router]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 bg-maroon-700 text-maroon-100">
      <LionMark className="h-10 w-10 animate-spin-loading text-white" />
      <span className="text-sm font-medium">Loading…</span>
    </main>
  );
}
