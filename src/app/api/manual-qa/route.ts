import { getServerConfig } from "@/lib/serverConfig";

// Manual Q&A is backed by a Cloudflare AI Search worker that indexes the
// official game manual PDF (RAG: retrieval + generation both happen in the
// worker). This route proxies it server-side so clients only ever talk to
// our own API and the backing worker can be swapped via MANUAL_QA_RAG_URL.

const MAX_QUESTION_CHARS = 1000;

// The game manual is static, so a given question always yields the same
// grounded answer. Cache answers in-process (Fluid Compute reuses instances)
// so common rules questions — "height limit?", "penalty for pinning?" — skip
// the full retrieve-and-generate round-trip on repeat asks and return instantly.
const ANSWER_TTL_MS = 60 * 60_000; // 1 hour
const MAX_CACHE_ENTRIES = 300;

interface CachedAnswer {
  answer: string;
  sources: RagAskResponse["sources"];
  expires: number;
}

const answerCache = new Map<string, CachedAnswer>();

/** Normalize so trivial phrasing/whitespace differences share a cache slot. */
function cacheKey(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

function readCache(key: string): CachedAnswer | null {
  const hit = answerCache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    answerCache.delete(key);
    return null;
  }
  // Refresh LRU recency: re-insert so eviction drops truly-cold entries.
  answerCache.delete(key);
  answerCache.set(key, hit);
  return hit;
}

function writeCache(key: string, value: CachedAnswer): void {
  answerCache.set(key, value);
  while (answerCache.size > MAX_CACHE_ENTRIES) {
    const oldest = answerCache.keys().next().value;
    if (oldest === undefined) break;
    answerCache.delete(oldest);
  }
}

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

  const key = cacheKey(question);
  const cached = readCache(key);
  if (cached) {
    return Response.json(
      { answer: cached.answer, sources: cached.sources, cached: true },
      { headers: { "x-manual-qa-cache": "hit" } },
    );
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
    const answer = data.answer ?? "";
    const sources = data.sources ?? [];
    // Only cache real, grounded answers — never a blank/failed generation.
    if (answer.trim()) {
      writeCache(key, { answer, sources, expires: Date.now() + ANSWER_TTL_MS });
    }
    return Response.json({ answer, sources });
  } catch {
    return Response.json(
      { error: "Could not reach the manual assistant." },
      { status: 502 },
    );
  }
}
