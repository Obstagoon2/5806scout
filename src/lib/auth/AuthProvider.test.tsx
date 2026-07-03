import { render, screen, waitFor } from "@testing-library/react";
import type { User } from "firebase/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";

const { onAuthStateChangedMock, onSnapshotMock, docMock } = vi.hoisted(() => ({
  onAuthStateChangedMock: vi.fn(),
  onSnapshotMock: vi.fn(),
  docMock: vi.fn(),
}));

vi.mock("@/lib/firebase/client", () => ({
  auth: {},
  db: {},
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: onAuthStateChangedMock,
}));

vi.mock("firebase/firestore", () => ({
  doc: docMock,
  onSnapshot: onSnapshotMock,
}));

function Probe() {
  const { user, profile, loading } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="uid">{user?.uid ?? "none"}</span>
      <span data-testid="profile-name">{profile?.fullName ?? "none"}</span>
    </div>
  );
}

beforeEach(() => {
  onAuthStateChangedMock.mockReset();
  onSnapshotMock.mockReset();
  docMock.mockReset();
});

describe("AuthProvider", () => {
  it("starts loading and resolves to signed-out state when no user", async () => {
    let authCallback: (user: User | null) => void = () => {};
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      authCallback = cb;
      return () => {};
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("loading").textContent).toBe("true");

    authCallback(null);

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("uid").textContent).toBe("none");
  });

  it("loads the Firestore profile once a user signs in", async () => {
    let authCallback: (user: User | null) => void = () => {};
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      authCallback = cb;
      return () => {};
    });

    let snapshotCallback: (snap: { data: () => unknown }) => void = () => {};
    onSnapshotMock.mockImplementation((_ref, cb) => {
      snapshotCallback = cb;
      return () => {};
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    authCallback({ uid: "abc123" } as User);
    expect(screen.getByTestId("loading").textContent).toBe("true");

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    snapshotCallback({
      data: () => ({
        email: "scout@example.com",
        fullName: "Jane Scout",
        teamId: "5806",
        role: "scout",
        active: true,
      }),
    });

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("profile-name").textContent).toBe("Jane Scout");
  });

  it("throws when useAuth is called outside a provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );
    consoleError.mockRestore();
  });
});
