import Anthropic from "@anthropic-ai/sdk";
import manualChunksJson from "@/data/manual-chunks.json";
import { rankChunks, type ManualChunk } from "@/lib/manual";
import { getServerConfig } from "@/lib/serverConfig";

// The manual is ingested at setup time (npm run ingest-manual) into
// src/data/manual-chunks.json and bundled here — retrieval and the Claude
// call both happen server-side, so clients only ever send a question.

const MANUAL_CHUNKS = manualChunksJson as ManualChunk[];

const MAX_QUESTION_CHARS = 1000;

interface QaRequestBody {
  question?: string;
}

export async function GET(): Promise<Response> {
  return Response.json({
    ready: MANUAL_CHUNKS.length > 0,
    chunkCount: MANUAL_CHUNKS.length,
  });
}

export async function POST(req: Request): Promise<Response> {
  const { anthropicApiKey, manualQaModel } = getServerConfig();
  if (!anthropicApiKey) {
    return Response.json(
      {
        error:
          "ANTHROPIC_API_KEY is not configured. Add it to .env.local to enable Manual Q&A.",
      },
      { status: 503 },
    );
  }
  if (MANUAL_CHUNKS.length === 0) {
    return Response.json(
      {
        error:
          "No game manual has been ingested yet. Run `npm run ingest-manual -- <manual.txt>` and rebuild.",
      },
      { status: 503 },
    );
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

  const chunks = rankChunks(question, MANUAL_CHUNKS);
  if (chunks.length === 0) {
    return Response.json({
      answer:
        "I couldn't find anything in the game manual related to that question. Try rephrasing with rule numbers or game-specific terms.",
      citations: [],
    });
  }

  const excerpts = chunks
    .map((c) => `<excerpt id="${c.index + 1}">\n${c.text}\n</excerpt>`)
    .join("\n\n");

  const client = new Anthropic({ apiKey: anthropicApiKey });

  try {
    const response = await client.messages.create({
      model: manualQaModel,
      max_tokens: 1024,
      system:
        "You answer FRC (FIRST Robotics Competition) game-manual questions for scouts during a competition. " +
        "Answer ONLY from the provided manual excerpts. Cite every claim with the excerpt id in square brackets, e.g. [2]. " +
        "If the excerpts don't contain the answer, say so plainly and do not guess. Keep answers short and rule-precise.",
      messages: [
        {
          role: "user",
          content: `Manual excerpts:\n\n${excerpts}\n\nQuestion: ${question}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({
        answer: "I can't answer that question.",
        citations: [],
      });
    }

    const answer = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    return Response.json({
      answer,
      citations: chunks.map((c) => c.index + 1),
    });
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `Claude API error (${err.status}).`
        : "Could not reach the Claude API.";
    return Response.json({ error: message }, { status: 502 });
  }
}
