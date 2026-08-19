import { describe, expect, it } from "vitest";
import {
  needsEmailVerification,
  VERIFICATION_REQUIRED_FROM,
  type VerifiableUser,
} from "./emailVerification";

const AFTER = new Date(VERIFICATION_REQUIRED_FROM + 86_400_000).toISOString();
const BEFORE = new Date(VERIFICATION_REQUIRED_FROM - 86_400_000).toISOString();

function user(overrides: Partial<VerifiableUser> = {}): VerifiableUser {
  return {
    emailVerified: false,
    providerData: [{ providerId: "password" }],
    metadata: { creationTime: AFTER },
    ...overrides,
  };
}

describe("needsEmailVerification", () => {
  it("holds a new email/password account that hasn't verified", () => {
    expect(needsEmailVerification(user())).toBe(true);
  });

  it("lets a verified account straight through", () => {
    expect(needsEmailVerification(user({ emailVerified: true }))).toBe(false);
  });

  it("lets Google accounts through — the provider already proved the address", () => {
    expect(
      needsEmailVerification(
        user({ providerData: [{ providerId: "google.com" }] }),
      ),
    ).toBe(false);
  });

  it("still holds an account that has both Google and a password", () => {
    expect(
      needsEmailVerification(
        user({
          providerData: [
            { providerId: "google.com" },
            { providerId: "password" },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("grandfathers accounts created before the gate shipped", () => {
    expect(
      needsEmailVerification(user({ metadata: { creationTime: BEFORE } })),
    ).toBe(false);
  });

  it("holds an account created exactly at the cutoff", () => {
    expect(
      needsEmailVerification(
        user({
          metadata: {
            creationTime: new Date(VERIFICATION_REQUIRED_FROM).toISOString(),
          },
        }),
      ),
    ).toBe(true);
  });

  it("grandfathers rather than locks out when creationTime is unusable", () => {
    expect(needsEmailVerification(user({ metadata: {} }))).toBe(false);
    expect(
      needsEmailVerification(user({ metadata: { creationTime: "nonsense" } })),
    ).toBe(false);
  });

  it("lets an account with no providers through", () => {
    expect(needsEmailVerification(user({ providerData: [] }))).toBe(false);
  });
});
