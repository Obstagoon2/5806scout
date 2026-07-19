"use client";

import { useEffect } from "react";

// Registers the offline service worker (public/sw.js). Production only —
// a service worker in dev serves stale bundles and fights hot reload.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Registration failing (private mode, unsupported) just means no
      // offline shell — the app itself still works.
    });
  }, []);
  return null;
}
