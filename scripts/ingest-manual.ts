// One-time setup step: chunk the game manual and bake it into the app.
//
//   npm run ingest-manual -- path/to/game-manual.txt
//
// Reads a plain-text (or markdown) manual, splits it with the same chunker
// the Q&A route uses for retrieval, and writes src/data/manual-chunks.json.
// The Next.js build bundles that JSON into the /api/manual-qa route — no
// in-app upload, no per-team Firestore storage. Re-run whenever the manual
// changes, then rebuild/restart.
//
// Runs on Node 22.6+ (built-in TypeScript type stripping; Node 24 needs no
// flag). PDFs must be converted to text first (e.g. `pdftotext manual.pdf`).

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chunkManual } from "../src/lib/manual.ts";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run ingest-manual -- <path-to-manual.txt>");
  process.exit(1);
}

const text = readFileSync(resolve(inputPath), "utf8");
const chunks = chunkManual(text);
if (chunks.length === 0) {
  console.error(`No content found in ${inputPath} — is it plain text?`);
  process.exit(1);
}

const outPath = resolve(import.meta.dirname, "../src/data/manual-chunks.json");
writeFileSync(outPath, JSON.stringify(chunks, null, 2) + "\n");
console.log(
  `Ingested ${inputPath}: ${chunks.length} chunks (${text.length} chars) → src/data/manual-chunks.json`,
);
console.log("Restart the dev server (or rebuild) to pick up the new manual.");
