"use client";

import { useCallback, useSyncExternalStore } from "react";

// A view preference kept in localStorage — which stat a table shows, which
// sub-tab was open, that sort of thing. Not app data: nothing here is worth
// a Firestore write or a sync to the rest of the team.
//
// Read through useSyncExternalStore rather than an effect that calls
// setState. localStorage doesn't exist while the page prerenders, so the
// server snapshot is the fallback and React swaps in the stored value on
// hydration without a mismatch warning — and without the cascading render an
// effect-and-setState version would cost on every mount.

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab writing the same key should move this one too.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function announce(): void {
  for (const listener of listeners) listener();
}

/**
 * A string preference from a known set. Anything unrecognised in storage
 * (an older build's value, a hand-edited key) falls back rather than
 * rendering a state the caller can't handle.
 */
export function useStoredPreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const read = useCallback((): T => {
    try {
      const stored = window.localStorage.getItem(key);
      return allowed.includes(stored as T) ? (stored as T) : fallback;
    } catch {
      // Private browsing and blocked storage both throw; the default is fine.
      return fallback;
    }
  }, [key, allowed, fallback]);

  const serverValue = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(subscribe, read, serverValue);

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Not persisting is survivable; failing to re-render is not.
      }
      announce();
    },
    [key],
  );

  return [value, set];
}
