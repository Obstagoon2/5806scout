"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import type { EventData } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

type View = "teams" | "schedule";

type SyncStatus =
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "error"; message: string };

const inputClass =
  "font-stat w-44 rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-maroon-400 focus:ring-2 focus:ring-maroon-100";

export default function EventPage() {
  const { profile } = useAuth();
  const [eventCode, setEventCode] = useState("");
  const [view, setView] = useState<View>("teams");
  const [event, setEvent] = useState<EventData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ state: "idle" });

  useEffect(() => {
    if (!profile) return;
    return onSnapshot(
      doc(db, "teams", profile.teamId, "config", "event"),
      (snapshot) => {
        setEvent(snapshot.exists() ? (snapshot.data() as EventData) : null);
        setLoaded(true);
      },
    );
  }, [profile]);

  async function handleSync(code: string) {
    if (!profile) return;
    const key = code.trim().toLowerCase();
    if (!key) return;

    setStatus({ state: "syncing" });
    try {
      const res = await fetch(`/api/event/${encodeURIComponent(key)}`);
      const body = (await res.json()) as EventData & { error?: string };
      if (!res.ok) {
        setStatus({
          state: "error",
          message: body.error ?? `Sync failed (${res.status}).`,
        });
        return;
      }
      await setDoc(doc(db, "teams", profile.teamId, "config", "event"), {
        ...body,
        syncedAt: Date.now(),
      });
      setStatus({ state: "idle" });
      setEventCode("");
    } catch {
      setStatus({ state: "error", message: "Sync failed — are you online?" });
    }
  }

  const isAdmin = profile?.role === "admin";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-graphite-900">Event</h1>
          <p className="mt-1 text-sm text-graphite-500">
            {event
              ? `${event.eventName} · ${event.teams.length} teams · synced ${new Date(event.syncedAt).toLocaleString()}`
              : "Team list, match schedule, and EPA stats from TBA + Statbotics."}
          </p>
        </div>

        {isAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSync(eventCode);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Event code, e.g. 2026njski"
              value={eventCode}
              onChange={(e) => setEventCode(e.target.value)}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={status.state === "syncing" || !eventCode.trim()}
              className="rounded-md bg-maroon-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-maroon-700 disabled:opacity-60"
            >
              {status.state === "syncing" ? "Syncing…" : "Sync"}
            </button>
            {event && (
              <button
                type="button"
                disabled={status.state === "syncing"}
                onClick={() => void handleSync(event.eventKey)}
                className="rounded-md border border-graphite-200 bg-white px-3 py-2 text-sm font-medium text-graphite-700 transition hover:border-graphite-300 disabled:opacity-60"
              >
                Refresh
              </button>
            )}
          </form>
        )}
      </div>

      {status.state === "error" && (
        <p className="rounded-md bg-maroon-50 px-3 py-2 text-sm text-maroon-700">
          {status.message}
        </p>
      )}

      {loaded && !event && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-white px-6 py-12 text-center text-sm text-graphite-500">
          No event synced yet.
          {isAdmin
            ? " Enter your event code above (find it on thebluealliance.com)."
            : " Ask your admin to sync the event."}
        </div>
      )}

      {event && (
        <>
          <div className="flex w-fit rounded-md border border-graphite-200 bg-white p-0.5">
            {(["teams", "schedule"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`rounded px-3.5 py-1.5 text-sm font-medium transition ${
                  view === v
                    ? "bg-maroon-600 text-white"
                    : "text-graphite-600 hover:text-graphite-900"
                }`}
              >
                {v === "teams" ? "Teams" : "Schedule"}
              </button>
            ))}
          </div>

          {view === "teams" && <TeamsTable event={event} />}
          {view === "schedule" && (
            <ScheduleTable event={event} myTeam={profile?.teamId ?? ""} />
          )}
        </>
      )}
    </main>
  );
}

function TeamsTable({ event }: { event: EventData }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-graphite-200 bg-white">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
            <th className="px-3 py-2.5">Team</th>
            <th className="px-3 py-2.5">Name</th>
            <th className="px-3 py-2.5">City</th>
            <th className="px-3 py-2.5">EPA</th>
            <th className="px-3 py-2.5">EPA Rank</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-graphite-100">
          {event.teams.map((t) => (
            <tr key={t.teamNumber}>
              <td className="font-stat px-3 py-2 font-semibold">{t.teamNumber}</td>
              <td className="px-3 py-2">{t.nickname}</td>
              <td className="px-3 py-2 text-graphite-500">{t.city}</td>
              <td className="font-stat px-3 py-2">
                {t.epa !== null ? t.epa.toFixed(1) : "—"}
              </td>
              <td className="font-stat px-3 py-2">{t.epaRank ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const COMP_LEVEL_LABELS: Record<string, string> = {
  qm: "Q",
  ef: "EF",
  qf: "QF",
  sf: "SF",
  f: "F",
};

function ScheduleTable({ event, myTeam }: { event: EventData; myTeam: string }) {
  const myNumber = Number(myTeam);
  return (
    <div className="overflow-x-auto rounded-lg border border-graphite-200 bg-white">
      <table className="w-full min-w-max text-left text-sm">
        <thead>
          <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
            <th className="px-3 py-2.5">Match</th>
            <th className="px-3 py-2.5">Red</th>
            <th className="px-3 py-2.5">Blue</th>
            <th className="px-3 py-2.5">Score</th>
            <th className="px-3 py-2.5">Time</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-graphite-100">
          {event.matches.map((m) => (
            <tr key={m.key}>
              <td className="font-stat px-3 py-2 font-semibold">
                {COMP_LEVEL_LABELS[m.compLevel] ?? m.compLevel}
                {m.matchNumber}
              </td>
              <td className="px-3 py-2">
                <AllianceCell teams={m.red} color="red" myNumber={myNumber} won={m.winner === "red"} />
              </td>
              <td className="px-3 py-2">
                <AllianceCell teams={m.blue} color="blue" myNumber={myNumber} won={m.winner === "blue"} />
              </td>
              <td className="font-stat px-3 py-2">
                {m.redScore !== null && m.blueScore !== null
                  ? `${m.redScore} – ${m.blueScore}`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-graphite-500">
                {m.scheduledTime
                  ? new Date(m.scheduledTime * 1000).toLocaleString(undefined, {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : "—"}
              </td>
            </tr>
          ))}
          {event.matches.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-graphite-400">
                Schedule not posted yet — refresh once quals are published.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AllianceCell({
  teams,
  color,
  myNumber,
  won,
}: {
  teams: number[];
  color: "red" | "blue";
  myNumber: number;
  won: boolean;
}) {
  return (
    <span className={`font-stat flex gap-2 ${won ? "font-semibold" : ""}`}>
      {teams.map((t) => (
        <span
          key={t}
          className={
            t === myNumber
              ? "rounded bg-amber-100 px-1 text-amber-900"
              : color === "red"
                ? "text-maroon-700"
                : "text-sky-700"
          }
        >
          {t}
        </span>
      ))}
    </span>
  );
}
