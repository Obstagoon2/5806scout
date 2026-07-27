import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getServerConfig } from "./serverConfig";

const ORIGINAL_ENV = { ...process.env };

const DEFAULT_RAG_URL = "https://soft-hill-26e4.nakul-sethi-212.workers.dev";
const DEFAULT_CF_ACCOUNT_ID = "77886244760af9d4f07c7394b8d4cd00";
const DEFAULT_CF_AI_SEARCH_INSTANCE = "game-manual-2026";

describe("getServerConfig", () => {
  beforeEach(() => {
    delete process.env.TBA_API_KEY;
    delete process.env.MANUAL_QA_RAG_URL;
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_AI_SEARCH_INSTANCE;
    delete process.env.CF_AI_SEARCH_TOKEN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null for unset optional keys and the built-in defaults", () => {
    expect(getServerConfig()).toEqual({
      tbaApiKey: null,
      manualQaRagUrl: DEFAULT_RAG_URL,
      cfAccountId: DEFAULT_CF_ACCOUNT_ID,
      cfAiSearchInstance: DEFAULT_CF_AI_SEARCH_INSTANCE,
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
