import { auth } from "@/lib/firebase/client";

// Attaches the signed-in user's Firebase ID token as a Bearer header.
// Server routes that proxy paid/rate-limited third-party APIs (TBA,
// Anthropic) require this token — see src/lib/auth/verifyBearerToken.ts.
export async function authedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
