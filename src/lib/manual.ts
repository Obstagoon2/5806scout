// Game Manual Q&A: chunking + retrieval helpers. The manual is ingested at
// setup time (scripts/ingest-manual.ts) into src/data/manual-chunks.json and
// bundled into the API route. Retrieval is simple keyword overlap scoring —
// no embeddings, so it works without any external vector store and degrades
// predictably.

export interface ManualChunk {
  /** Position in the manual, used as the citation number. */
  index: number;
  text: string;
}

const MAX_CHUNK_CHARS = 1600;

/**
 * Split manual text into chunks on paragraph boundaries, merging short
 * paragraphs and splitting very long ones so each chunk stays a useful
 * retrieval unit.
 */
export function chunkManual(text: string): ManualChunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_CHARS) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      // Hard-split oversized paragraphs (tables, rule lists) on sentence-ish
      // boundaries where possible.
      let rest = paragraph;
      while (rest.length > MAX_CHUNK_CHARS) {
        let cut = rest.lastIndexOf(". ", MAX_CHUNK_CHARS);
        if (cut < MAX_CHUNK_CHARS / 2) cut = MAX_CHUNK_CHARS;
        chunks.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
      }
      if (rest) current = rest;
      continue;
    }

    if (current.length + paragraph.length + 2 > MAX_CHUNK_CHARS) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) chunks.push(current);

  return chunks.map((text, index) => ({ index, text }));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/**
 * Rank chunks by keyword overlap with the question. Rarer terms (appearing
 * in fewer chunks) weigh more, a cheap IDF so words like "robot" don't
 * dominate rule-specific terms like "G301".
 */
export function rankChunks(
  question: string,
  chunks: readonly ManualChunk[],
  limit: number = 6,
): ManualChunk[] {
  const questionTerms = new Set(tokenize(question));
  if (questionTerms.size === 0) return [];

  const chunkTokens = chunks.map((c) => tokenize(c.text));
  const docFrequency = new Map<string, number>();
  for (const tokens of chunkTokens) {
    for (const term of new Set(tokens)) {
      docFrequency.set(term, (docFrequency.get(term) ?? 0) + 1);
    }
  }

  const scored = chunks.map((chunk, i) => {
    let score = 0;
    for (const term of chunkTokens[i]) {
      if (questionTerms.has(term)) {
        score += 1 / (docFrequency.get(term) ?? 1);
      }
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.chunk);
}
