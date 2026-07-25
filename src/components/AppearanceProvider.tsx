"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  APPEARANCE_DOC_ID,
  appearanceCss,
  DEFAULT_APPEARANCE,
  isDefaultAppearance,
  sanitizeAppearance,
  type AppearanceConfig,
} from "@/lib/appearance";
import { db } from "@/lib/firebase/client";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";

const AppearanceContext = createContext<AppearanceConfig>(DEFAULT_APPEARANCE);

const STYLE_ELEMENT_ID = "appearance-vars";

/**
 * Subscribes once to the team's appearance doc and applies it app-wide by
 * injecting a <style> that overrides the palette CSS variables (see
 * appearance.ts). Also shares the config so the header can swap its logo.
 * Mounted in the app shell, inside AuthProvider so dataTeamId is available.
 */
export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dataTeamId } = useAuth();
  const [config, setConfig] = useState<AppearanceConfig>(DEFAULT_APPEARANCE);

  useEffect(() => {
    if (!dataTeamId) {
      setConfig(DEFAULT_APPEARANCE);
      return;
    }
    return onSnapshot(
      doc(db, "teams", dataTeamId, "config", APPEARANCE_DOC_ID),
      (snapshot) => setConfig(sanitizeAppearance(snapshot.data())),
      () => setConfig(DEFAULT_APPEARANCE),
    );
  }, [dataTeamId]);

  useEffect(() => {
    const existing = document.getElementById(STYLE_ELEMENT_ID);
    // Nothing customized -> ship the stock stylesheet, no override needed.
    if (isDefaultAppearance(config)) {
      existing?.remove();
      return;
    }
    const style =
      existing ??
      document.head.appendChild(
        Object.assign(document.createElement("style"), {
          id: STYLE_ELEMENT_ID,
        }),
      );
    style.textContent = appearanceCss(config);
    // Left mounted between snapshots so re-skins don't flash; removed only when
    // the config reverts to defaults (above) or the app unmounts entirely.
  }, [config]);

  return (
    <AppearanceContext.Provider value={config}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance(): AppearanceConfig {
  return useContext(AppearanceContext);
}
