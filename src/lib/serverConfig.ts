// Server-only environment access (API routes). Unlike src/lib/config.ts
// (client Firebase config, required + statically inlined), these are secrets
// that must never reach the client bundle, and they're optional: routes that
// need a missing key respond with a clear setup message instead of crashing
// the whole app.

export interface ServerConfig {
  /** The Blue Alliance read key — https://www.thebluealliance.com/account */
  tbaApiKey: string | null;
  /**
   * FRC Nexus API key — https://frc.nexus/api. Backs the pit map on the Event
   * tab and live queueing on the Pit Dashboard, neither of which TBA publishes.
   */
  nexusApiKey: string | null;
  /**
   * Base URL of the Cloudflare AI Search worker that backs Manual Q&A
   * (RAG over the official game manual PDF). Kept server-side so the client
   * only ever talks to our own API. Used as the fallback when the in-app AI
   * Search REST path isn't configured.
   */
  manualQaRagUrl: string | null;
  /**
   * Cloudflare AI Search (RAG) accessed directly from this app's API route —
   * retrieval + generation over the game manual, no intermediary worker. The
   * token is the secret; the account id and instance merely identify whose
   * account to bill, which is why none of the three is baked into the source.
   * When all are set, Manual Q&A runs in-app; otherwise it falls back to the
   * worker above, and without that the tab reports the manual isn't loaded.
   */
  cfAccountId: string | null;
  cfAiSearchInstance: string | null;
  cfAiSearchToken: string | null;
}

// Deliberately no defaults. These used to carry a working account id and
// worker URL, which is fine in a private repo and not fine in a public one:
// the URL named its owner, and anyone with the source could spend that
// account's Manual Q&A quota. A fork now starts inert until its own values
// are set, and every consumer already degrades to a setup message.
export function getServerConfig(): ServerConfig {
  return {
    tbaApiKey: process.env.TBA_API_KEY || null,
    nexusApiKey: process.env.NEXUS_API_KEY || null,
    manualQaRagUrl: process.env.MANUAL_QA_RAG_URL || null,
    cfAccountId: process.env.CF_ACCOUNT_ID || null,
    cfAiSearchInstance: process.env.CF_AI_SEARCH_INSTANCE || null,
    cfAiSearchToken: process.env.CF_AI_SEARCH_TOKEN || null,
  };
}
