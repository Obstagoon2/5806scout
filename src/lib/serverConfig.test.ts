import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getServerConfig } from "./serverConfig";

const ORIGINAL_ENV = { ...process.env };

describe("getServerConfig", () => {
  beforeEach(() => {
    delete process.env.TBA_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.MANUAL_QA_MODEL;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null for unset optional keys and the default model", () => {
    expect(getServerConfig()).toEqual({
      tbaApiKey: null,
      anthropicApiKey: null,
      manualQaModel: "claude-haiku-4-5-20251001",
    });
  });

  it("treats an empty string env var as unset", () => {
    process.env.TBA_API_KEY = "";
    expect(getServerConfig().tbaApiKey).toBeNull();
  });

  it("reads configured values, including a custom model override", () => {
    process.env.TBA_API_KEY = "tba-key";
    process.env.ANTHROPIC_API_KEY = "anthropic-key";
    process.env.MANUAL_QA_MODEL = "claude-custom";

    expect(getServerConfig()).toEqual({
      tbaApiKey: "tba-key",
      anthropicApiKey: "anthropic-key",
      manualQaModel: "claude-custom",
    });
  });
});
