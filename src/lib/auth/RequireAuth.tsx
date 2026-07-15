"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-graphite-500">
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin-loading rounded-full border-2 border-graphite-300 border-t-maroon-500"
        />
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
