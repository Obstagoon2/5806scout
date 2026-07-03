// Server-only environment access (API routes). Unlike src/lib/config.ts
// (client Firebase config, required + statically inlined), these are secrets
// that must never reach the client bundle, and they're optional: routes that
// need a missing key respond with a clear setup message instead of crashing
// the whole app.

export interface ServerConfig {
  /** The Blue Alliance read key — https://www.thebluealliance.com/account */
  tbaApiKey: string | null;
  /** Anthropic API key for Game Manual Q&A. */
  anthropicApiKey: string | null;
  /**
   * Model used for Manual Q&A answers. A small, fast model — this is simple
   * retrieval + answer over one manual, not complex reasoning. Swap via env
   * if a better cheap model ships.
   */
  manualQaModel: string;
  /** Secret code that lets a signup create an admin account. */
  adminSignupCode: string | null;
}

export function getServerConfig(): ServerConfig {
  return {
    tbaApiKey: process.env.TBA_API_KEY || null,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
    manualQaModel: process.env.MANUAL_QA_MODEL || "claude-haiku-4-5-20251001",
    adminSignupCode: process.env.ADMIN_SIGNUP_CODE || null,
  };
}
