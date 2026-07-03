import { InviteError, inviteScout } from "@/lib/inviteScout";

// Admin-only: creates a scout account for their team and has Firebase email
// the scout a link to set their password. Caller identity + admin role are
// verified server-side in inviteScout() from the bearer ID token.

interface InviteBody {
  fullName?: string;
  email?: string;
}

export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!idToken) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: InviteBody;
  try {
    body = (await req.json()) as InviteBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = body.fullName?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  if (!fullName || !email) {
    return Response.json(
      { error: "Name and email are both required." },
      { status: 400 },
    );
  }

  try {
    const result = await inviteScout(idToken, fullName, email);
    return Response.json({ invited: result.email });
  } catch (err) {
    if (err instanceof InviteError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json(
      { error: "Invite failed — try again." },
      { status: 500 },
    );
  }
}
