"use client";

import { useEffect, useState } from "react";

// The manual itself is ingested at build/setup time (npm run ingest-manual)
// and lives server-side — this page is just the chat surface.

interface ManualStatus {
  ready: boolean;
  chunkCount: number;
}

interface QaTurn {
  question: string;
  answer: string | null; // null while loading
  error?: string;
}

const inputClass =
  "w-full rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100";

export default function ManualQaPage() {
  const [status, setStatus] = useState<ManualStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/manual-qa")
      .then((res) => res.json())
      .then((body: ManualStatus) => {
        if (!cancelled) setStatus(body);
      })
      .catch(() => {
        if (!cancelled) setStatus({ ready: false, chunkCount: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = status?.ready ?? false;

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    setAsking(true);
    setQuestion("");
    setTurns((prev) => [...prev, { question: q, answer: null }]);

    try {
      const res = await fetch("/api/manual-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const body = (await res.json()) as { answer?: string; error?: string };
      setTurns((prev) =>
        prev.map((t, i) =>
          i === prev.length - 1
            ? res.ok
              ? { ...t, answer: body.answer ?? "" }
              : {
                  ...t,
                  answer: "",
                  error: body.error ?? `Request failed (${res.status}).`,
                }
            : t,
        ),
      );
    } catch {
      setTurns((prev) =>
        prev.map((t, i) =>
          i === prev.length - 1
            ? { ...t, answer: "", error: "Could not reach the server." }
            : t,
        ),
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-graphite-900">Manual Q&amp;A</h1>
        <p className="mt-1 text-sm text-graphite-500">
          {ready
            ? `Ask rules questions and get cited answers — ${status?.chunkCount} manual sections loaded.`
            : "Ask rules questions and get cited answers from the game manual."}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="self-end rounded-lg bg-maroon-600 px-3 py-2 text-sm text-white">
              {turn.question}
            </p>
            <div className="self-start rounded-lg border border-graphite-200 bg-white px-3 py-2 text-sm text-graphite-800">
              {turn.answer === null ? (
                <span className="text-graphite-400">Checking the manual…</span>
              ) : turn.error ? (
                <span className="text-maroon-700">{turn.error}</span>
              ) : (
                <span className="whitespace-pre-wrap">{turn.answer}</span>
              )}
            </div>
          </div>
        ))}
        {turns.length === 0 && status !== null && (
          <div className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-10 text-center text-sm text-graphite-500">
            {ready
              ? "Ask something like “what’s the penalty for pinning?”"
              : "The game manual hasn’t been ingested yet — ask whoever runs the app to load it."}
          </div>
        )}
      </div>

      <form onSubmit={handleAsk} className="flex items-center gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={ready ? "Ask a rules question…" : "Manual not loaded yet"}
          disabled={!ready}
          className={inputClass}
        />
        <button
          type="submit"
          disabled={!ready || asking || !question.trim()}
          className="shrink-0 rounded-md bg-maroon-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
        >
          {asking ? "…" : "Ask"}
        </button>
      </form>
    </main>
  );
}
