"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { authedFetch } from "@/lib/authFetch";
import type { EventData, EventMatch } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import {
  QUEUE_ALERT_MS,
  currentMatch,
  formatCountdown,
  lastPlayedMatch,
  matchLabel,
  msUntilMatch,
  nextTeamMatch,
} from "@/lib/pitDashboard";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

const LIVE_REFRESH_MS = 60_000;

interface PitTodoItem {
  id: string;
  text: string;
  done: boolean;
}

interface PitTodoDoc {
  items: PitTodoItem[];
  updatedAt: number;
}

interface LiveResponse {
  matches?: EventMatch[];
  fetchedAt?: number;
  error?: string;
}

export default function PitDashboardPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [event, setEvent] = useState<EventData | null>(null);
  const [eventLoaded, setEventLoaded] = useState(false);
  const [liveMatches, setLiveMatches] = useState<EventMatch[] | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The synced event doc supplies the event key (and a match-list fallback
  // until the first live poll lands).
  useEffect(() => {
    if (!profile || !isAdmin) return;
    return onSnapshot(
      doc(db, "teams", profile.teamId, "config", "event"),
      (snapshot) => {
        setEvent(snapshot.exists() ? (snapshot.data() as EventData) : null);
        setEventLoaded(true);
      },
    );
  }, [profile, isAdmin]);

  // Live match feed from The Blue Alliance, refreshed every minute.
  useEffect(() => {
    if (!isAdmin || !event?.eventKey) return;
    let cancelled = false;

    async function load(eventKey: string) {
      try {
        const res = await authedFetch(`/api/event/${encodeURIComponent(eventKey)}/live`);
        const body = (await res.json()) as LiveResponse;
        if (cancelled) return;
        if (!res.ok || !body.matches) {
          setLiveError(body.error ?? "Could not load live match data.");
          return;
        }
        setLiveMatches(body.matches);
        setFetchedAt(body.fetchedAt ?? Date.now());
        setLiveError(null);
      } catch {
        if (!cancelled) setLiveError("Could not load live match data — are you online?");
      }
    }

    void load(event.eventKey);
    const timer = setInterval(() => void load(event.eventKey), LIVE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isAdmin, event?.eventKey]);

  // One-second tick drives the queue countdown and the blink threshold.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (profile && !isAdmin) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6">
        <div className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-12 text-center text-sm text-graphite-500">
          The Pit Dashboard is only available to admins.
        </div>
      </main>
    );
  }

  const matches = liveMatches ?? event?.matches ?? [];
  const teamNumber = Number(profile?.teamId ?? "");
  const onField = currentMatch(matches);
  const lastPlayed = lastPlayedMatch(matches);
  const ourNext = nextTeamMatch(matches, teamNumber);
  const msToQueue = ourNext ? msUntilMatch(ourNext, now) : null;
  const queueAlert = ourNext !== null && msToQueue !== null && msToQueue < QUEUE_ALERT_MS;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="text-xl font-semibold text-graphite-900">Pit Dashboard</h1>
        <p className="mt-1 text-sm text-graphite-500">
          {event
            ? `${event.eventName} — live from The Blue Alliance${
                fetchedAt !== null
                  ? `, updated ${new Date(fetchedAt).toLocaleTimeString()}`
                  : ""
              }.`
            : "Live match tracking and pit tasks for admins."}
        </p>
      </div>

      {liveError && (
        <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
          {liveError}
        </p>
      )}

      {eventLoaded && !event && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-12 text-center text-sm text-graphite-500">
          No event synced yet — sync one on the Event tab to light up the
          dashboard.
        </div>
      )}

      {event && (
        <div className="grid gap-4 md:grid-cols-2">
          <CurrentMatchCard
            onField={onField}
            lastPlayed={lastPlayed}
            ourNext={ourNext}
            hasSchedule={matches.length > 0}
          />
          <QueueingCard ourNext={ourNext} msToQueue={msToQueue} alert={queueAlert} />
          <div className="md:col-span-2">
            <TodoCard teamId={profile?.teamId ?? ""} />
          </div>
        </div>
      )}
    </main>
  );
}

function CurrentMatchCard({
  onField,
  lastPlayed,
  ourNext,
  hasSchedule,
}: {
  onField: EventMatch | null;
  lastPlayed: EventMatch | null;
  ourNext: EventMatch | null;
  hasSchedule: boolean;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-graphite-200 bg-white p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
        Current match
      </h2>
      {hasSchedule ? (
        <>
          <p className="font-stat text-5xl font-bold text-graphite-900">
            {onField ? matchLabel(onField) : "Done"}
          </p>
          <div className="flex flex-col gap-1 text-sm text-graphite-600">
            <span>
              Last played:{" "}
              <span className="font-stat font-semibold">
                {lastPlayed ? matchLabel(lastPlayed) : "—"}
              </span>
            </span>
            <span>
              Our next match:{" "}
              <span className="font-stat font-semibold">
                {ourNext ? matchLabel(ourNext) : "none left"}
              </span>
              {ourNext?.scheduledTime && (
                <span className="text-graphite-500">
                  {" "}
                  at{" "}
                  {new Date(ourNext.scheduledTime * 1000).toLocaleTimeString(
                    undefined,
                    { hour: "numeric", minute: "2-digit" },
                  )}
                </span>
              )}
            </span>
          </div>
        </>
      ) : (
        <p className="py-4 text-sm text-graphite-500">
          Schedule not posted yet — TBA publishes it shortly before quals.
        </p>
      )}
    </section>
  );
}

function QueueingCard({
  ourNext,
  msToQueue,
  alert,
}: {
  ourNext: EventMatch | null;
  msToQueue: number | null;
  alert: boolean;
}) {
  return (
    <section
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 p-5 text-center ${
        alert
          ? "animate-queue-blink border-red-600"
          : "border-graphite-200 bg-white"
      }`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wider opacity-70">
        Queuing
      </h2>
      {ourNext === null ? (
        <p className="py-3 text-sm text-graphite-500">
          No upcoming match — nothing to queue for.
        </p>
      ) : msToQueue === null ? (
        <p className="py-3 text-sm text-graphite-500">
          {matchLabel(ourNext)} has no scheduled time from TBA yet.
        </p>
      ) : (
        <>
          <p className="font-stat text-5xl font-bold">
            {formatCountdown(msToQueue)}
          </p>
          <p className="text-sm font-medium">
            {alert
              ? `QUEUE NOW for ${matchLabel(ourNext)}!`
              : `until ${matchLabel(ourNext)} — head to queue 5 min out.`}
          </p>
        </>
      )}
    </section>
  );
}

function TodoCard({ teamId }: { teamId: string }) {
  const [items, setItems] = useState<PitTodoItem[]>([]);
  const [draft, setDraft] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    return onSnapshot(doc(db, "teams", teamId, "config", "pitTodo"), (s) => {
      setItems(s.exists() ? (s.data() as PitTodoDoc).items : []);
    });
  }, [teamId]);

  async function save(next: PitTodoItem[]): Promise<void> {
    setItems(next);
    setSaveError(null);
    try {
      await setDoc(doc(db, "teams", teamId, "config", "pitTodo"), {
        items: next,
        updatedAt: Date.now(),
      } satisfies PitTodoDoc);
    } catch {
      setSaveError("Could not save the list — check your connection.");
    }
  }

  function addItem(): void {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void save([...items, { id: crypto.randomUUID(), text, done: false }]);
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-graphite-200 bg-white p-5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-graphite-500">
        Pit to-do list
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addItem();
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          placeholder="e.g. Swap intake belts before Q34"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-md bg-maroon-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
        >
          Add
        </button>
      </form>

      {saveError && (
        <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
          {saveError}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-graphite-300 px-4 py-6 text-center text-sm text-graphite-400">
          Nothing on the list — add tasks for the pit crew above.
        </p>
      ) : (
        <ul className="divide-y divide-graphite-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  void save(
                    items.map((i) =>
                      i.id === item.id ? { ...i, done: !i.done } : i,
                    ),
                  )
                }
                className="h-4 w-4 accent-maroon-600"
              />
              <span
                className={`flex-1 text-sm ${
                  item.done
                    ? "text-graphite-400 line-through"
                    : "text-graphite-800"
                }`}
              >
                {item.text}
              </span>
              <button
                type="button"
                aria-label={`Remove "${item.text}"`}
                onClick={() =>
                  void save(items.filter((i) => i.id !== item.id))
                }
                className="rounded px-2 py-1 text-xs font-medium text-graphite-400 transition hover:bg-maroon-50 hover:text-maroon-700"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
