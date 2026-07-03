import { getServerConfig } from "@/lib/serverConfig";

// Validates the admin signup code server-side so the code never ships in the
// client JS bundle. The client only learns valid / not valid.

interface AdminCodeBody {
  code?: string;
}

export async function POST(req: Request): Promise<Response> {
  const { adminSignupCode } = getServerConfig();
  if (!adminSignupCode) {
    return Response.json(
      {
        error:
          "Admin signup is not configured. Set ADMIN_SIGNUP_CODE in .env.local.",
      },
      { status: 503 },
    );
  }

  let body: AdminCodeBody;
  try {
    body = (await req.json()) as AdminCodeBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.code !== "string" || body.code.trim() !== adminSignupCode) {
    return Response.json({ error: "Invalid admin code" }, { status: 403 });
  }

  return Response.json({ valid: true });
}
