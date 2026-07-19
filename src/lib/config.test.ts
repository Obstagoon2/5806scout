import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

const ORIGINAL_ENV = { ...process.env };

function setAllRequiredEnv() {
  for (const key of REQUIRED_KEYS) process.env[key] = `${key}-value`;
}

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const key of REQUIRED_KEYS) delete process.env[key];
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("builds the firebase config from env vars when all are present", async () => {
    setAllRequiredEnv();
    const { config } = await import("./config");
    expect(config.firebase.apiKey).toBe("NEXT_PUBLIC_FIREBASE_API_KEY-value");
    expect(config.firebase.projectId).toBe(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID-value",
    );
  });

  it("throws naming the missing env var when one is absent", async () => {
    setAllRequiredEnv();
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    await expect(import("./config")).rejects.toThrow(
      /NEXT_PUBLIC_FIREBASE_PROJECT_ID/,
    );
  });

  it("throws on the first missing var when several are absent", async () => {
    await expect(import("./config")).rejects.toThrow(
      /Missing required environment variable/,
    );
  });
});
