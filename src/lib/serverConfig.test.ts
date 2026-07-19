import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getServerConfig } from "./serverConfig";

const ORIGINAL_ENV = { ...process.env };

const DEFAULT_RAG_URL = "https://soft-hill-26e4.nakul-sethi-212.workers.dev";

describe("getServerConfig", () => {
  beforeEach(() => {
    delete process.env.TBA_API_KEY;
    delete process.env.MANUAL_QA_RAG_URL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null for unset optional keys and the default RAG worker URL", () => {
    expect(getServerConfig()).toEqual({
      tbaApiKey: null,
      manualQaRagUrl: DEFAULT_RAG_URL,
    });
  });

  it("treats an empty string env var as unset", () => {
    process.env.TBA_API_KEY = "";
    expect(getServerConfig().tbaApiKey).toBeNull();
  });

  it("reads configured values, including a custom RAG worker URL", () => {
    process.env.TBA_API_KEY = "tba-key";
    process.env.MANUAL_QA_RAG_URL = "https://rag.example.com";

    expect(getServerConfig()).toEqual({
      tbaApiKey: "tba-key",
      manualQaRagUrl: "https://rag.example.com",
    });
  });
});
