// Server-only environment access (API routes). Unlike src/lib/config.ts
// (client Firebase config, required + statically inlined), these are secrets
// that must never reach the client bundle, and they're optional: routes that
// need a missing key respond with a clear setup message instead of crashing
// the whole app.

export interface ServerConfig {
  /** The Blue Alliance read key — https://www.thebluealliance.com/account */
  tbaApiKey: string | null;
  /**
   * Base URL of the Cloudflare AI Search worker that backs Manual Q&A
   * (RAG over the official game manual PDF). Not a secret — the worker is
   * public — but kept server-side so the client only talks to our own API.
   */
  manualQaRagUrl: string;
}

const DEFAULT_MANUAL_QA_RAG_URL =
  "https://soft-hill-26e4.nakul-sethi-212.workers.dev";

export function getServerConfig(): ServerConfig {
  return {
    tbaApiKey: process.env.TBA_API_KEY || null,
    manualQaRagUrl: process.env.MANUAL_QA_RAG_URL || DEFAULT_MANUAL_QA_RAG_URL,
  };
}
