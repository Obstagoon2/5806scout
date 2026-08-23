"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
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

const inputClass = "field-input";

export default function ManualQaPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<ManualStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<QaTurn[]>([]);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/manual-qa")
      .then((res) => res.json() as Promise<ManualStatus>)
      .then((body) => {
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
      // The route bills the team's own AI account per answer, so it only
      // serves signed-in members.
      const idToken = await user?.getIdToken();
      const res = await fetch("/api/manual-qa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
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
        <h1 className="page-title">
          <span aria-hidden className="page-rule" />
          Manual Q&amp;A
        </h1>
        <p className="page-lede">
          {/* The in-app AI Search path knows the index is live but not how big
              it is, so it reports 0 — showing "0 manual sections loaded" reads
              as broken. Mention the count only when we actually have one. */}
          {ready && (status?.chunkCount ?? 0) > 0
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
            <div className="surface-card self-start px-3 py-2 text-sm text-graphite-800">
              {turn.answer === null ? (
                <span className="inline-flex items-center gap-2 text-graphite-400">
                  <span
                    aria-hidden
                    className="h-3 w-3 animate-spin-loading rounded-full border-2 border-graphite-300 border-t-maroon-500"
                  />
                  Checking the manual…
                </span>
              ) : turn.error ? (
                <span className="text-maroon-700 dark:text-maroon-300">{turn.error}</span>
              ) : (
                <span className="whitespace-pre-wrap">{turn.answer}</span>
              )}
            </div>
          </div>
        ))}
        {turns.length === 0 && status !== null && (
          <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-10 text-center text-sm text-graphite-500">
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
          className="btn-primary shrink-0 px-4 py-2"
        >
          {asking ? "…" : "Ask"}
        </button>
      </form>
    </main>
  );
}
