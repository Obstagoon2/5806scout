"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

// Reads the deep-link query params the dashboard hands off (see
// pitScoutHref/matchScoutHref in src/lib/dashboard.ts) and passes them to the
// page once. Tapping an assignment on the dashboard should land on the form
// with the robot already loaded — the scout shouldn't re-key a number they
// were just shown.
//
// This lives in its own component behind a Suspense boundary on purpose:
// /pit-scout and /match-scout are statically prerendered, and a static page
// calling useSearchParams from a client component fails the production build
// without one. Dev renders routes on demand and never suspends, so the
// missing boundary wouldn't show up until a deploy.

function ParamReader({
  names,
  onRead,
}: {
  names: readonly string[];
  onRead: (values: Record<string, string>) => void;
}) {
  const params = useSearchParams();

  // The page's handler closes over its own state and changes identity every
  // render; keeping the latest in a ref lets the effect depend only on the
  // param values, so it fires once per actual link rather than on every
  // render.
  const latest = useRef(onRead);
  useEffect(() => {
    latest.current = onRead;
  });

  // Serialized so the effect compares values, not URLSearchParams identity.
  const encoded = names
    .map((name) => `${name}=${encodeURIComponent(params.get(name) ?? "")}`)
    .join("&");

  useEffect(() => {
    const values: Record<string, string> = {};
    for (const pair of encoded.split("&")) {
      const separator = pair.indexOf("=");
      const value = decodeURIComponent(pair.slice(separator + 1));
      if (value) values[pair.slice(0, separator)] = value;
    }
    if (Object.keys(values).length > 0) latest.current(values);
  }, [encoded]);

  return null;
}

export function DeepLinkParams(props: {
  names: readonly string[];
  onRead: (values: Record<string, string>) => void;
}) {
  return (
    <Suspense fallback={null}>
      <ParamReader {...props} />
    </Suspense>
  );
}
