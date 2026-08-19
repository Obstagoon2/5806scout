import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getServerConfig } from "./serverConfig";

const ORIGINAL_ENV = { ...process.env };

describe("getServerConfig", () => {
  beforeEach(() => {
    delete process.env.TBA_API_KEY;
    delete process.env.NEXUS_API_KEY;
    delete process.env.MANUAL_QA_RAG_URL;
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_AI_SEARCH_INSTANCE;
    delete process.env.CF_AI_SEARCH_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null for every unset key — nothing is baked into the source", () => {
    // The account id, instance and worker URL used to have working defaults.
    // A public repo must not ship someone's account in it, so a fresh
    // checkout is inert until it's pointed at its own Cloudflare project.
    expect(getServerConfig()).toEqual({
      tbaApiKey: null,
      nexusApiKey: null,
      manualQaRagUrl: null,
      cfAccountId: null,
      cfAiSearchInstance: null,
      cfAiSearchToken: null,
    });
  });

  it("treats an empty string env var as unset", () => {
    process.env.TBA_API_KEY = "";
    process.env.CF_AI_SEARCH_TOKEN = "";
    expect(getServerConfig().tbaApiKey).toBeNull();
    expect(getServerConfig().cfAiSearchToken).toBeNull();
  });

  it("reads configured values, including a custom RAG worker URL", () => {
    process.env.TBA_API_KEY = "tba-key";
    process.env.MANUAL_QA_RAG_URL = "https://rag.example.com";

    expect(getServerConfig()).toMatchObject({
      tbaApiKey: "tba-key",
      manualQaRagUrl: "https://rag.example.com",
    });
  });

  it("reads the Cloudflare AI Search overrides", () => {
    process.env.CF_ACCOUNT_ID = "acct-123";
    process.env.CF_AI_SEARCH_INSTANCE = "manual-2027";
    process.env.CF_AI_SEARCH_TOKEN = "secret-token";

    expect(getServerConfig()).toMatchObject({
      cfAccountId: "acct-123",
      cfAiSearchInstance: "manual-2027",
      cfAiSearchToken: "secret-token",
    });
  });
});
