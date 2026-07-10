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
  const { user, profile, loading, dataTeamId } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="uid">{user?.uid ?? "none"}</span>
      <span data-testid="profile-name">{profile?.fullName ?? "none"}</span>
      <span data-testid="data-team">{dataTeamId ?? "none"}</span>
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

  it("loads the Firestore profile and team once a user signs in", async () => {
    let authCallback: (user: User | null) => void = () => {};
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      authCallback = cb;
      return () => {};
    });

    // First subscription is the profile doc, second is the team doc.
    const snapshotCallbacks: Array<
      (snap: { exists: () => boolean; data: () => unknown }) => void
    > = [];
    onSnapshotMock.mockImplementation((_ref, cb) => {
      snapshotCallbacks.push(cb);
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

    snapshotCallbacks[0]({
      exists: () => true,
      data: () => ({
        email: "scout@example.com",
        fullName: "Jane Scout",
        teamId: "5806",
        role: "scout",
        active: true,
      }),
    });

    // Loading holds until the team doc lands — pages need the sister-link
    // state before they can pick the right data store.
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId("loading").textContent).toBe("true");

    snapshotCallbacks[1]({
      exists: () => true,
      data: () => ({ teamNumber: "5806", teamName: "Test Team" }),
    });

    await waitFor(() => expect(screen.getByTestId("loading").textContent).toBe("false"));
    expect(screen.getByTestId("profile-name").textContent).toBe("Jane Scout");
    // Unlinked team: shared data lives in its own subtree.
    expect(screen.getByTestId("data-team").textContent).toBe("5806");
  });

  it("routes shared data to the canonical store when a sister team is linked", async () => {
    let authCallback: (user: User | null) => void = () => {};
    onAuthStateChangedMock.mockImplementation((_auth, cb) => {
      authCallback = cb;
      return () => {};
    });

    const snapshotCallbacks: Array<
      (snap: { exists: () => boolean; data: () => unknown }) => void
    > = [];
    onSnapshotMock.mockImplementation((_ref, cb) => {
      snapshotCallbacks.push(cb);
      return () => {};
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    authCallback({ uid: "abc123" } as User);
    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalled());

    snapshotCallbacks[0]({
      exists: () => true,
      data: () => ({
        email: "scout@example.com",
        fullName: "Jane Scout",
        teamId: "5806",
        role: "scout",
        active: true,
      }),
    });

    await waitFor(() => expect(onSnapshotMock).toHaveBeenCalledTimes(2));
    snapshotCallbacks[1]({
      exists: () => true,
      data: () => ({
        teamNumber: "5806",
        teamName: "Test Team",
        sisterTeamId: "254",
        sisterTeamNumber: "254",
        sisterTeamName: "Sister",
      }),
    });

    // 254 < 5806, so the sister team's subtree is the shared store.
    await waitFor(() => expect(screen.getByTestId("data-team").textContent).toBe("254"));
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("throws when useAuth is called outside a provider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(
      "useAuth must be used within an AuthProvider",
    );
    consoleError.mockRestore();
  });
});
