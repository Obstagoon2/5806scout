"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/pit-scout" : "/login");
  }, [user, loading, router]);

  return (
    <main className="flex flex-1 items-center justify-center text-graphite-500">
      Loading…
    </main>
  );
}
