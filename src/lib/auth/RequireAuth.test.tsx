import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RequireAuth } from "./RequireAuth";

const { useAuthMock, replaceMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: useAuthMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

beforeEach(() => {
  useAuthMock.mockReset();
  replaceMock.mockReset();
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

  it("renders children when authenticated", () => {
    useAuthMock.mockReturnValue({
      user: { uid: "abc123" },
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
