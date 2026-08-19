import { DeleteMemberError, deleteMember } from "@/lib/deleteMember";

// Admin-only: permanently deletes a teammate's Firebase Auth account and
// their users/{uid} profile, freeing their email for a fresh signup or a new
// invite. Caller identity + admin role are verified server-side in
// deleteMember() from the bearer ID token.

interface DeleteBody {
  uid?: string;
}

export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  if (!idToken) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const uid = body.uid?.trim() ?? "";
  if (!uid) {
    return Response.json(
      { error: "Which member to delete is required." },
      { status: 400 },
    );
  }
  // Firebase uids are alphanumeric and at most 128 chars. Rejecting anything
  // else here keeps a hostile value out of the privileged REST paths this
  // route builds downstream, rather than relying on those to be safe.
  if (!/^[A-Za-z0-9]{1,128}$/.test(uid)) {
    return Response.json({ error: "Invalid member id." }, { status: 400 });
  }

  try {
    const result = await deleteMember(idToken, uid);
    return Response.json({ deleted: result.fullName });
  } catch (err) {
    if (err instanceof DeleteMemberError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    return Response.json(
      { error: "Delete failed — try again." },
      { status: 500 },
    );
  }
}
