import { describe, expect, it } from "vitest";
import { chunkManual, rankChunks } from "./manual";

describe("chunkManual", () => {
  it("splits on blank lines and keeps paragraph text", () => {
    const chunks = chunkManual("Rule G101: no climbing.\n\nRule G102: no flying.");
    expect(chunks).toHaveLength(1); // short paragraphs merge into one chunk
    expect(chunks[0].text).toContain("G101");
    expect(chunks[0].text).toContain("G102");
  });

  it("starts a new chunk when the current one would exceed the limit", () => {
    const paragraph = "word ".repeat(200).trim(); // ~1000 chars
    const chunks = chunkManual(`${paragraph}\n\n${paragraph}\n\n${paragraph}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1700);
    }
  });

  it("hard-splits a single oversized paragraph", () => {
    const sentence = "This is a rule about scoring in the arena. ";
    const chunks = chunkManual(sentence.repeat(100));
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("assigns sequential indices", () => {
    const paragraph = "x".repeat(1500);
    const chunks = chunkManual(`${paragraph}\n\n${paragraph}`);
    expect(chunks.map((c) => c.index)).toEqual([0, 1]);
  });
});

describe("rankChunks", () => {
  const chunks = chunkManual(
    [
      "G301: Robots may not extend beyond the frame perimeter more than 12 inches.",
      "x".repeat(1500),
      "Scoring: each cargo scored in the high goal is worth 4 points during teleop.",
      "y".repeat(1500),
      "Endgame: hanging on the high rung earns 15 points.",
    ].join("\n\n"),
  );

  it("returns the most relevant chunk first", () => {
    const ranked = rankChunks("how many points is the high goal worth", chunks);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0].text).toContain("high goal");
  });

  it("finds rule numbers", () => {
    const ranked = rankChunks("what does G301 say", chunks);
    expect(ranked[0].text).toContain("G301");
  });

  it("returns empty for a question with no overlap", () => {
    expect(rankChunks("zzz qqq", chunks)).toEqual([]);
  });
});
