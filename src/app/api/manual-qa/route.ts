import { getServerConfig } from "@/lib/serverConfig";

// Manual Q&A is backed by a Cloudflare AI Search worker that indexes the
// official game manual PDF (RAG: retrieval + generation both happen in the
// worker). This route proxies it server-side so clients only ever talk to
// our own API and the backing worker can be swapped via MANUAL_QA_RAG_URL.

const MAX_QUESTION_CHARS = 1000;

interface QaRequestBody {
  question?: string;
}

interface RagStatus {
  completed?: number;
  engine?: { vectorize?: { vectorsCount?: number } };
}

interface RagAskResponse {
  answer?: string;
  sources?: Array<{ file: string; score: number; excerpt: string }>;
  error?: string;
}

export async function GET(): Promise<Response> {
  const { manualQaRagUrl } = getServerConfig();
  try {
    const res = await fetch(`${manualQaRagUrl}/api/status`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json({ ready: false, chunkCount: 0 });
    }
    const stats = (await res.json()) as RagStatus;
    return Response.json({
      ready: (stats.completed ?? 0) > 0,
      chunkCount: stats.engine?.vectorize?.vectorsCount ?? 0,
    });
  } catch {
    // Readiness probe only — the page shows its "manual not loaded" state.
    return Response.json({ ready: false, chunkCount: 0 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const { manualQaRagUrl } = getServerConfig();

  let body: QaRequestBody;
  try {
    body = (await req.json()) as QaRequestBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const question = body.question?.trim();
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return Response.json({ error: "Question is required." }, { status: 400 });
  }

  try {
    const res = await fetch(`${manualQaRagUrl}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = (await res.json()) as RagAskResponse;
    if (!res.ok) {
      return Response.json(
        { error: data.error ?? `Manual assistant error (${res.status}).` },
        { status: 502 },
      );
    }
    return Response.json({
      answer: data.answer ?? "",
      sources: data.sources ?? [],
    });
  } catch {
    return Response.json(
      { error: "Could not reach the manual assistant." },
      { status: 502 },
    );
  }
}
