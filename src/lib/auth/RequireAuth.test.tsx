import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VERIFICATION_REQUIRED_FROM } from "@/lib/emailVerification";
import { RequireAuth } from "./RequireAuth";

const {
  useAuthMock,
  replaceMock,
  sendEmailVerificationMock,
  signOutMock,
} = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  replaceMock: vi.fn(),
  sendEmailVerificationMock: vi.fn(),
  signOutMock: vi.fn(),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: useAuthMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

vi.mock("firebase/auth", () => ({
  sendEmailVerification: sendEmailVerificationMock,
  signOut: signOutMock,
}));

const AFTER_CUTOFF = new Date(VERIFICATION_REQUIRED_FROM + 1000).toISOString();
const BEFORE_CUTOFF = new Date(VERIFICATION_REQUIRED_FROM - 1000).toISOString();

/** A Firebase user, as much of one as RequireAuth actually touches. */
function fakeUser(overrides: Record<string, unknown> = {}) {
  return {
    uid: "abc123",
    email: "scout@example.com",
    emailVerified: true,
    providerData: [{ providerId: "password" }],
    metadata: { creationTime: AFTER_CUTOFF },
    reload: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  useAuthMock.mockReset();
  replaceMock.mockReset();
  sendEmailVerificationMock.mockReset();
  signOutMock.mockReset();
});

describe("RequireAuth", () => {
  it("shows a loading state and does not redirect while auth is resolving", () => {
    useAuthMock.mockReturnValue({ user: null, profile: null, loading: true });

    render(
      <RequireAuth>
        <div>secret content</div>
      </RequireAuth>,
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when resolved and unauthenticated", () => {
    useAuthMock.mockReturnValue({ user: null, profile: null, loading: false });

    render(
      <RequireAuth>
        <div>secret content</div>
      </RequireAuth>,
    );

    expect(replaceMock).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  it("renders children when authenticated and verified", () => {
    useAuthMock.mockReturnValue({
      user: fakeUser(),
      profile: null,
      loading: false,
    });

    render(
      <RequireAuth>
        <div>secret content</div>
      </RequireAuth>,
    );

    expect(screen.getByText("secret content")).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe("the email verification gate", () => {
  function renderUnverified(overrides: Record<string, unknown> = {}) {
    const user = fakeUser({ emailVerified: false, ...overrides });
    useAuthMock.mockReturnValue({ user, profile: null, loading: false });
    render(
      <RequireAuth>
        <div>secret content</div>
      </RequireAuth>,
    );
    return user;
  }

  it("withholds the app from a new, unverified email/password account", () => {
    renderUnverified();

    expect(screen.getByText("Verify your email")).toBeInTheDocument();
    expect(screen.getByText("scout@example.com")).toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  it("lets a Google account past — the provider already proved the address", () => {
    renderUnverified({ providerData: [{ providerId: "google.com" }] });

    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  it("lets an account created before the gate shipped past", () => {
    renderUnverified({ metadata: { creationTime: BEFORE_CUTOFF } });

    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  it("opens the app once a re-check finds the link was clicked", async () => {
    const user = renderUnverified();
    // reload() mutates the Firebase user in place, which is what the gate
    // re-reads — so model that rather than returning a fresh object.
    user.reload = vi.fn(async () => {
      user.emailVerified = true;
    });

    await userEvent.click(screen.getByRole("button", { name: "I've verified" }));

    await waitFor(() =>
      expect(screen.getByText("secret content")).toBeInTheDocument(),
    );
  });

  it("says so plainly when the link still hasn't been clicked", async () => {
    renderUnverified();

    await userEvent.click(screen.getByRole("button", { name: "I've verified" }));

    await waitFor(() =>
      expect(
        screen.getByText("Still not verified — open the link in the email first."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  it("resends the verification email on request", async () => {
    const user = renderUnverified();
    sendEmailVerificationMock.mockResolvedValue(undefined);

    await userEvent.click(screen.getByRole("button", { name: "Resend email" }));

    expect(sendEmailVerificationMock).toHaveBeenCalledWith(user);
    await waitFor(() =>
      expect(
        screen.getByText("Sent again — it can take a minute to arrive."),
      ).toBeInTheDocument(),
    );
  });

  it("reports a failed resend instead of pretending it went", async () => {
    renderUnverified();
    sendEmailVerificationMock.mockRejectedValue(new Error("too many requests"));

    await userEvent.click(screen.getByRole("button", { name: "Resend email" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "Could not send another email just yet — wait a minute and try again.",
        ),
      ).toBeInTheDocument(),
    );
  });

  it("offers a way out for someone stuck at the gate", async () => {
    renderUnverified();

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOutMock).toHaveBeenCalled();
  });
});
