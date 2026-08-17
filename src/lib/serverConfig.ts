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
   * (RAG over the official game manual PDF). Not a secret — the worker is
   * public — but kept server-side so the client only talks to our own API.
   * Used as the fallback when the in-app AI Search REST path isn't configured.
   */
  manualQaRagUrl: string;
  /**
   * Cloudflare AI Search (RAG) accessed directly from this app's API route —
   * retrieval + generation over the game manual, no intermediary worker. The
   * account id and instance aren't secret; the token is and lives only in env.
   * When the token is set, Manual Q&A runs in-app; otherwise it falls back to
   * the worker above.
   */
  cfAccountId: string;
  cfAiSearchInstance: string;
  cfAiSearchToken: string | null;
}

const DEFAULT_MANUAL_QA_RAG_URL =
  "https://soft-hill-26e4.nakul-sethi-212.workers.dev";
const DEFAULT_CF_ACCOUNT_ID = "77886244760af9d4f07c7394b8d4cd00";
const DEFAULT_CF_AI_SEARCH_INSTANCE = "game-manual-2026";

export function getServerConfig(): ServerConfig {
  return {
    tbaApiKey: process.env.TBA_API_KEY || null,
    nexusApiKey: process.env.NEXUS_API_KEY || null,
    manualQaRagUrl: process.env.MANUAL_QA_RAG_URL || DEFAULT_MANUAL_QA_RAG_URL,
    cfAccountId: process.env.CF_ACCOUNT_ID || DEFAULT_CF_ACCOUNT_ID,
    cfAiSearchInstance:
      process.env.CF_AI_SEARCH_INSTANCE || DEFAULT_CF_AI_SEARCH_INSTANCE,
    cfAiSearchToken: process.env.CF_AI_SEARCH_TOKEN || null,
  };
}
