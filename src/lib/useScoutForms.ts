"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  applyCustomization,
  sanitizeScoutFormsConfig,
  SCOUT_FORMS_DOC_ID,
  type ScoutFormsConfig,
} from "@/lib/customForms";
import { db } from "@/lib/firebase/client";
import type { FormSection } from "@/lib/formSchema";
import { MATCH_SCOUT_SECTIONS } from "@/lib/matchScoutSchema";
import { PIT_SCOUT_SECTIONS } from "@/lib/pitScoutSchema";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

interface ScoutForms {
  /** Raw per-team customization, null until the config doc snapshot lands. */
  config: ScoutFormsConfig | null;
  /** Effective Pit Scout schema (defaults until the config resolves). */
  pitSections: FormSection[];
  /**
   * Effective Match Scout schema — the REBUILT data dictionary with this
   * team's customization applied. The Match Scout page is a bespoke UI, but it
   * renders off this too (skipping dropped questions, appending added ones),
   * and Data/Drive/Teams/Picklist derive their columns from it.
   */
  matchSections: FormSection[];
}

/**
 * The team's effective scout-form schemas: the pit defaults with this team's
 * customization (teams/{dataTeamId}/config/scoutForms) applied live. Reads
 * the shared store so a sister pair fills out — and aggregates — one form.
 */
export function useScoutForms(): ScoutForms {
  const { dataTeamId } = useAuth();
  const [config, setConfig] = useState<ScoutFormsConfig | null>(null);

  useEffect(() => {
    if (!dataTeamId) return;
    setConfig(null);
    return onSnapshot(
      doc(db, "teams", dataTeamId, "config", SCOUT_FORMS_DOC_ID),
      (snapshot) => setConfig(sanitizeScoutFormsConfig(snapshot.data())),
    );
  }, [dataTeamId]);

  const pitSections = useMemo(
    () => applyCustomization(PIT_SCOUT_SECTIONS, config?.pitScout),
    [config],
  );
  // Memoized because downstream pages key their own useMemo off this array —
  // a fresh copy every render would defeat their caching.
  const matchSections = useMemo(
    () => applyCustomization(MATCH_SCOUT_SECTIONS, config?.matchScout),
    [config],
  );

  return { config, pitSections, matchSections };
}
