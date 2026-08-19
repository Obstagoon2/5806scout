import { getServerConfig } from "@/lib/serverConfig";
import { bearerToken, uidFromIdToken } from "@/lib/verifyCaller";

// Manual Q&A is RAG (retrieval + generation) over the official game-manual PDF,
// indexed by a Cloudflare AI Search instance. This route runs the RAG itself:
// when a CF AI Search token is configured it calls the AI Search REST API
// directly (in-app, no intermediary), and otherwise falls back to the public
// worker proxy — so the feature keeps working before/without the token.

const MAX_QUESTION_CHARS = 1000;

const SYSTEM_PROMPT = [
  "You are a rules assistant for the FIRST Robotics Competition 2026 season.",
  "Answer questions using only the retrieved excerpts from the official 2026 Game Manual.",
  "Cite rule numbers and section names when they appear in the excerpts.",
  "If the retrieved excerpts do not contain the answer, say so plainly instead of guessing.",
].join(" ");

interface Source {
  file: string;
  score: number;
  excerpt: string;
}

interface AskResult {
  answer: string;
  sources: Source[];
}

// The game manual is static, so a given question always yields the same
// grounded answer. Cache answers in-process (Fluid Compute reuses instances)
// so common rules questions — "height limit?", "penalty for pinning?" — skip
// the full retrieve-and-generate round-trip on repeat asks and return instantly.
const ANSWER_TTL_MS = 60 * 60_000; // 1 hour
const MAX_CACHE_ENTRIES = 300;

interface CachedAnswer {
  answer: string;
  sources: Source[];
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
  sources?: Source[];
  error?: string;
}

// AI Search chat/completions is OpenAI-compatible; Cloudflare may wrap it in a
// { result, success } envelope, so parsing tolerates both shapes.
interface CfPayload {
  choices?: Array<{ message?: { content?: string } }>;
  chunks?: unknown;
}
interface CfAiSearchResponse extends CfPayload {
  result?: CfPayload;
}

/** Map AI Search chunk objects to display sources, defensively — the exact
 *  chunk shape varies, so unknown fields degrade to sensible blanks. */
function mapSources(chunks: unknown): Source[] {
  if (!Array.isArray(chunks)) return [];
  return chunks
    .map((raw) => {
      const c = raw as {
        item?: { key?: string };
        filename?: string;
        score?: number;
        text?: string;
      };
      const text = typeof c.text === "string" ? c.text : "";
      return {
        file: c.item?.key ?? c.filename ?? "",
        score: typeof c.score === "number" ? Math.round(c.score * 100) / 100 : 0,
        excerpt: text.length > 240 ? `${text.slice(0, 240)}…` : text,
      };
    })
    .filter((s) => s.file || s.excerpt);
}

/**
 * Run the RAG directly against the Cloudflare AI Search REST API. Returns null
 * when unconfigured (no token) or on any failure, so the caller can fall back
 * to the worker rather than surfacing a hard error.
 */
async function askViaAiSearch(question: string): Promise<AskResult | null> {
  const { cfAccountId, cfAiSearchInstance, cfAiSearchToken } =
    getServerConfig();
  // All three are needed to address an instance; a partial config falls back
  // to the worker rather than building a URL with "null" in the path.
  if (!cfAiSearchToken || !cfAccountId || !cfAiSearchInstance) return null;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai-search/instances/${cfAiSearchInstance}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfAiSearchToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: question },
          ],
          stream: false,
          // Same retrieval tuning as the worker (soft-hill-26e4/src/index.ts).
          // Without it the API defaults to ~10 chunks and no expansion, which
          // measurably loses answers: a chunk can end mid-heading ("6.5.3
          // Point Values … detailed in Table 6-4.") so the model sees the
          // pointer to the scoring table but never the table, and replies
          // "the excerpts do not contain the answer". context_expansion pulls
          // in the neighbouring chunk, which is where those values live.
          ai_search_options: {
            retrieval: { max_num_results: 6, context_expansion: 1 },
            // No history is sent from here, so rewriting is pure latency.
            query_rewrite: { enabled: false },
          },
        }),
      },
    );
    if (!res.ok) {
      // Falling back to the worker keeps answers flowing, but a silent switch
      // hides a bad token or a rejected option shape — leave a trace in the
      // function logs so it's diagnosable rather than invisible.
      console.warn(
        `manual-qa: AI Search REST returned ${res.status}; falling back to the worker.`,
      );
      return null;
    }
    const body = (await res.json()) as CfAiSearchResponse;
    const payload = body.result ?? body;
    const answer = payload.choices?.[0]?.message?.content ?? "";
    if (!answer.trim()) return null;
    return { answer, sources: mapSources(payload.chunks) };
  } catch {
    return null;
  }
}

/** Fallback: the public Cloudflare worker proxy. Returns null on any failure. */
async function askViaWorker(question: string): Promise<AskResult | null> {
  const { manualQaRagUrl } = getServerConfig();
  if (!manualQaRagUrl) return null;
  try {
    const res = await fetch(`${manualQaRagUrl}/api/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RagAskResponse;
    return { answer: data.answer ?? "", sources: data.sources ?? [] };
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const { manualQaRagUrl, cfAiSearchToken } = getServerConfig();
  // With the in-app token configured, the index is assumed live (it's the same
  // instance the worker reports on); skip the worker round-trip.
  if (cfAiSearchToken) {
    return Response.json({ ready: true, chunkCount: 0 });
  }
  // Neither path configured — the page shows its "manual not loaded" state.
  if (!manualQaRagUrl) {
    return Response.json({ ready: false, chunkCount: 0 });
  }
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
  // Every answer costs a retrieval and a generation against the team's own
  // Cloudflare account, so this can't be an open endpoint — the deployment
  // URL is public whether or not the source is. Any signed-in member may
  // ask; the check is "is this one of us", not a role.
  if (!(await uidFromIdToken(bearerToken(req)))) {
    return Response.json({ error: "Sign in to ask a question." }, { status: 401 });
  }

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

  // Prefer the in-app AI Search path; fall back to the worker proxy.
  const result = (await askViaAiSearch(question)) ?? (await askViaWorker(question));
  if (!result) {
    return Response.json(
      { error: "Could not reach the manual assistant." },
      { status: 502 },
    );
  }

  // Only cache real, grounded answers — never a blank/failed generation.
  if (result.answer.trim()) {
    writeCache(key, {
      answer: result.answer,
      sources: result.sources,
      expires: Date.now() + ANSWER_TTL_MS,
    });
  }
  return Response.json({ answer: result.answer, sources: result.sources });
}
