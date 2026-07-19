"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import type { EventData, EventRankingRow } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";

type View = "teams" | "schedule" | "ranking" | "map";

const VIEW_LABELS: Record<View, string> = {
  teams: "Teams",
  schedule: "Schedule",
  ranking: "Ranking",
  map: "Map",
};

type SyncStatus =
  | { state: "idle" }
  | { state: "syncing" }
  | { state: "error"; message: string };

const inputClass = "field-input stat w-44";

export default function EventPage() {
  const { profile, dataTeamId } = useAuth();
  const [eventCode, setEventCode] = useState("");
  const [view, setView] = useState<View>("teams");
  const [event, setEvent] = useState<EventData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<SyncStatus>({ state: "idle" });

  useEffect(() => {
    // The synced event lives in the shared store — one event per sister pair.
    if (!dataTeamId) return;
    return onSnapshot(
      doc(db, "teams", dataTeamId, "config", "event"),
      (snapshot) => {
        setEvent(snapshot.exists() ? (snapshot.data() as EventData) : null);
        setLoaded(true);
      },
    );
  }, [dataTeamId]);

  async function handleSync(code: string) {
    if (!dataTeamId) return;
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
      await setDoc(doc(db, "teams", dataTeamId, "config", "event"), {
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
          <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
            <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
            Event
          </h1>
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
              className="btn-primary px-4 py-2"
            >
              {status.state === "syncing" ? "Syncing…" : "Sync"}
            </button>
            {event && (
              <button
                type="button"
                disabled={status.state === "syncing"}
                onClick={() => void handleSync(event.eventKey)}
                className="btn-secondary px-3 py-2"
              >
                Refresh
              </button>
            )}
          </form>
        )}
      </div>

      {status.state === "error" && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {status.message}
        </p>
      )}

      {loaded && !event && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          No event synced yet.
          {isAdmin
            ? " Enter your event code above (find it on thebluealliance.com)."
            : " Ask your admin to sync the event."}
        </div>
      )}

      {event && (
        <>
          <div className="surface-card flex w-fit p-0.5">
            {(["teams", "schedule", "ranking", "map"] as const).map((v) => (
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
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {view === "teams" && <TeamsTable event={event} />}
          {view === "schedule" && (
            <ScheduleTable event={event} myTeam={profile?.teamId ?? ""} />
          )}
          {view === "ranking" && (
            <RankingTable eventKey={event.eventKey} myTeam={profile?.teamId ?? ""} />
          )}
          {view === "map" && (
            <MapView
              event={event}
              teamId={dataTeamId ?? ""}
              isAdmin={isAdmin}
            />
          )}
        </>
      )}
    </main>
  );
}

function TeamsTable({ event }: { event: EventData }) {
  return (
    <div className="surface-card overflow-x-auto">
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
            <tr key={t.teamNumber} className="transition hover:bg-graphite-50">
              <td className="stat px-3 py-2 font-semibold">{t.teamNumber}</td>
              <td className="px-3 py-2">{t.nickname}</td>
              <td className="px-3 py-2 text-graphite-500">{t.city}</td>
              <td className="stat px-3 py-2">
                {t.epa !== null ? t.epa.toFixed(1) : "—"}
              </td>
              <td className="stat px-3 py-2">{t.epaRank ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PitMapDoc {
  url: string;
  updatedAt: number;
}

function MapView({
  event,
  teamId,
  isAdmin,
}: {
  event: EventData;
  teamId: string;
  isAdmin: boolean;
}) {
  const [pitMap, setPitMap] = useState<PitMapDoc | null>(null);
  const [pitMapUrl, setPitMapUrl] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const venue = event.venue ?? null;

  useEffect(() => {
    if (!teamId) return;
    return onSnapshot(doc(db, "teams", teamId, "config", "pitMap"), (s) => {
      setPitMap(s.exists() ? (s.data() as PitMapDoc) : null);
    });
  }, [teamId]);

  async function savePitMap(url: string) {
    setSaveError(null);
    try {
      await setDoc(doc(db, "teams", teamId, "config", "pitMap"), {
        url,
        updatedAt: Date.now(),
      });
      setPitMapUrl("");
    } catch {
      setSaveError("Could not save the pit map — check your connection.");
    }
  }

  const mapsHref =
    venue?.gmapsUrl ??
    `https://www.google.com/maps/search/${encodeURIComponent(
      [venue?.name, venue?.address, venue?.city].filter(Boolean).join(", ") ||
        event.eventName,
    )}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="surface-card p-4">
        <h2 className="text-sm font-semibold text-graphite-900">Venue</h2>
        {venue ? (
          <p className="mt-1 text-sm text-graphite-600">
            {[venue.name, venue.address, venue.city].filter(Boolean).join(" · ") ||
              "No venue details published for this event."}
          </p>
        ) : (
          <p className="mt-1 text-sm text-graphite-500">
            Venue details missing — hit Refresh above to re-sync the event with
            venue data.
          </p>
        )}
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm font-medium text-maroon-600 dark:text-maroon-400 hover:text-maroon-700 dark:hover:text-maroon-300"
        >
          Open in Google Maps ↗
        </a>
      </div>

      {venue?.lat != null && venue?.lng != null && (
        <iframe
          title="Venue map"
          className="h-72 w-full rounded-lg border border-graphite-200"
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${venue.lng - 0.004},${venue.lat - 0.003},${venue.lng + 0.004},${venue.lat + 0.003}&layer=mapnik&marker=${venue.lat},${venue.lng}`}
        />
      )}

      <div className="surface-card flex flex-col gap-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-graphite-900">Pit map</h2>
          <p className="mt-1 text-sm text-graphite-500">
            Pit layouts aren&apos;t published through any API — event organizers
            hand them out as an image or PDF.{" "}
            {isAdmin
              ? "Paste the image URL here so the whole team sees it."
              : "Your admin can add it here for the whole team."}
          </p>
        </div>

        {isAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (pitMapUrl.trim()) void savePitMap(pitMapUrl.trim());
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="url"
              placeholder="https://… (pit map image URL)"
              value={pitMapUrl}
              onChange={(e) => setPitMapUrl(e.target.value)}
              className={`${inputClass} w-72`}
            />
            <button
              type="submit"
              disabled={!pitMapUrl.trim()}
              className="btn-primary px-4 py-2"
            >
              {pitMap ? "Replace" : "Add"}
            </button>
          </form>
        )}

        {saveError && (
          <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
            {saveError}
          </p>
        )}

        {pitMap ? (
          <a href={pitMap.url} target="_blank" rel="noreferrer">
            {/* External image from an arbitrary host chosen at runtime —
                next/image would require whitelisting domains in next.config. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pitMap.url}
              alt="Event pit map"
              className="max-h-[32rem] w-full rounded-md border border-graphite-100 object-contain"
            />
          </a>
        ) : (
          <p className="rounded-lg border border-dashed border-graphite-300 px-4 py-8 text-center text-sm text-graphite-400">
            No pit map added yet.
          </p>
        )}
      </div>
    </div>
  );
}

const RANKING_REFRESH_MS = 60_000;

function RankingTable({ eventKey, myTeam }: { eventKey: string; myTeam: string }) {
  const [rankings, setRankings] = useState<EventRankingRow[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myNumber = Number(myTeam);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(
          `/api/event/${encodeURIComponent(eventKey)}/rankings`,
        );
        const body = (await res.json()) as {
          rankings?: EventRankingRow[];
          fetchedAt?: number;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.rankings) {
          setError(body.error ?? "Could not load rankings.");
          return;
        }
        setRankings(body.rankings);
        setFetchedAt(body.fetchedAt ?? Date.now());
        setError(null);
      } catch {
        if (!cancelled) setError("Could not load rankings — are you online?");
      }
    }

    void load();
    const timer = setInterval(() => void load(), RANKING_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [eventKey]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-graphite-400">
        Live from Statbotics — refreshes every minute.
        {fetchedAt !== null &&
          ` Last updated ${new Date(fetchedAt).toLocaleTimeString()}.`}
      </p>

      {error && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {error}
        </p>
      )}

      {rankings === null && !error && (
        <div className="rounded-lg border border-dashed border-graphite-300 bg-graphite-50 px-6 py-12 text-center text-sm text-graphite-500">
          <span
            aria-hidden
            className="mx-auto mb-2 block h-4 w-4 animate-spin-loading rounded-full border-2 border-graphite-300 border-t-maroon-500"
          />
          Loading rankings…
        </div>
      )}

      {rankings !== null && (
        <div className="surface-card overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b border-graphite-200 text-xs uppercase tracking-wider text-graphite-500">
                <th className="px-3 py-2.5">Rank</th>
                <th className="px-3 py-2.5">Team</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Record</th>
                <th className="px-3 py-2.5">RPs / match</th>
                <th className="px-3 py-2.5">EPA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100">
              {rankings.map((row) => (
                <tr
                  key={row.teamNumber}
                  className={`transition hover:bg-graphite-50 ${row.teamNumber === myNumber ? "bg-amber-50" : ""}`}
                >
                  <td className="stat px-3 py-2 font-semibold text-graphite-400">
                    {row.rank ?? "—"}
                  </td>
                  <td className="stat px-3 py-2 font-semibold">
                    {row.teamNumber}
                  </td>
                  <td className="px-3 py-2">{row.teamName}</td>
                  <td className="stat px-3 py-2">
                    {row.wins !== null
                      ? `${row.wins}–${row.losses ?? 0}–${row.ties ?? 0}`
                      : "—"}
                  </td>
                  <td className="stat px-3 py-2">
                    {row.rpsPerMatch !== null ? row.rpsPerMatch.toFixed(2) : "—"}
                  </td>
                  <td className="stat px-3 py-2">
                    {row.epa !== null ? row.epa.toFixed(1) : "—"}
                  </td>
                </tr>
              ))}
              {rankings.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-graphite-400">
                    No ranking data yet — Statbotics publishes it once quals
                    start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
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
    <div className="surface-card overflow-x-auto">
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
            <tr key={m.key} className="transition hover:bg-graphite-50">
              <td className="stat px-3 py-2 font-semibold">
                {COMP_LEVEL_LABELS[m.compLevel] ?? m.compLevel}
                {m.matchNumber}
              </td>
              <td className="px-3 py-2">
                <AllianceCell teams={m.red} color="red" myNumber={myNumber} won={m.winner === "red"} />
              </td>
              <td className="px-3 py-2">
                <AllianceCell teams={m.blue} color="blue" myNumber={myNumber} won={m.winner === "blue"} />
              </td>
              <td className="stat px-3 py-2">
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
    <span className={`stat flex gap-2 ${won ? "font-semibold" : ""}`}>
      {teams.map((t) => (
        <span
          key={t}
          className={
            t === myNumber
              ? "rounded bg-amber-100 px-1 text-amber-900 dark:text-amber-200"
              : color === "red"
                ? "text-maroon-700 dark:text-maroon-300"
                : "text-sky-700 dark:text-sky-300"
          }
        >
          {t}
        </span>
      ))}
    </span>
  );
}
