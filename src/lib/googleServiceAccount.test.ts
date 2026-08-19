import { afterEach, describe, expect, it } from "vitest";

import { readServiceAccount } from "./googleServiceAccount";

const KEY = {
  client_email: "sa@test.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
};

afterEach(() => {
  delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
});

describe("readServiceAccount", () => {
  it("returns null when the key isn't configured", () => {
    expect(readServiceAccount()).toBeNull();
  });

  it("returns null for an empty or whitespace value", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "   ";
    expect(readServiceAccount()).toBeNull();
  });

  it("reads the raw service-account JSON", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify(KEY);
    expect(readServiceAccount()).toEqual({
      clientEmail: KEY.client_email,
      privateKey: KEY.private_key,
    });
  });

  it("reads a base64-encoded key, which is how hosts avoid mangling newlines", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = Buffer.from(
      JSON.stringify(KEY),
    ).toString("base64");
    expect(readServiceAccount()?.privateKey).toBe(KEY.private_key);
  });

  it("restores newlines escaped as \\n inside the private key", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      ...KEY,
      private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n",
    });
    expect(readServiceAccount()?.privateKey).toBe(KEY.private_key);
  });

  it("returns null for malformed JSON rather than throwing", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = "{not json";
    expect(readServiceAccount()).toBeNull();
  });

  it("returns null when the key is missing its email or private key", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
      client_email: KEY.client_email,
    });
    expect(readServiceAccount()).toBeNull();
  });
});
