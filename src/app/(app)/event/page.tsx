"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import type {
  EventData,
  EventRankingRow,
  EventSearchResult,
} from "@/lib/eventData";
import { ReliabilityWarning } from "@/components/ReliabilityFlags";
import { db } from "@/lib/firebase/client";
import { fileToResizedDataUrl, isImageFile } from "@/lib/imageFile";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";

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
          <div className="flex items-center gap-2">
            <EventSearchBox
              syncing={status.state === "syncing"}
              onSync={(key) => void handleSync(key)}
            />
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
          </div>
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
            ? " Search for your event above by name or TBA code."
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

const SEARCH_DEBOUNCE_MS = 250;

function formatEventDates(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${end}T00:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
  const md = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return s.getTime() === e.getTime() ? md(s) : `${md(s)} – ${md(e)}`;
}

/**
 * TBA-style typeahead: search events by name or code, pick one to sync it.
 * Typing an exact event key (e.g. "2026njski") and submitting still works.
 */
function EventSearchBox({
  syncing,
  onSync,
}: {
  syncing: boolean;
  onSync: (key: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLFormElement | null>(null);
  // Set when choose() writes the picked event's name into the input — that
  // programmatic change must not kick off another search.
  const skipSearchRef = useRef(false);

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/event-search?q=${encodeURIComponent(q)}`,
            { signal: controller.signal },
          );
          const body = (await res.json()) as { results?: EventSearchResult[] };
          if (!res.ok || !body.results) return;
          setResults(body.results);
          setActive(0);
          setOpen(true);
        } catch {
          // Aborted by a newer keystroke or offline — keep what's shown.
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
    }
  }

  function choose(result: EventSearchResult) {
    skipSearchRef.current = true;
    setQuery(result.name);
    setOpen(false);
    onSync(result.key);
  }

  function handleSubmit() {
    const q = query.trim().toLowerCase();
    // An exact event key syncs directly; otherwise take the highlighted match.
    if (/^\d{4}[a-z0-9]+$/.test(q)) {
      setOpen(false);
      onSync(q);
    } else if (results[active]) {
      choose(results[active]);
    } else if (results[0]) {
      choose(results[0]);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (results.length > 0) {
        setOpen(true);
        setActive((i) => Math.min(i + 1, results.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <form
      ref={boxRef}
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit();
      }}
      className="flex items-center gap-2"
    >
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="event-search-listbox"
          placeholder="Search events — name or code"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="field-input w-64"
        />
        {open && results.length > 0 && (
          <ul
            id="event-search-listbox"
            role="listbox"
            className="surface-card absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto p-1"
          >
            {results.map((result, i) => (
              <li key={result.key} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onClick={() => choose(result)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full flex-col rounded px-2.5 py-1.5 text-left transition ${
                    i === active ? "bg-graphite-100" : ""
                  }`}
                >
                  <span className="truncate text-sm font-medium text-graphite-900">
                    {result.name}
                  </span>
                  <span className="truncate text-xs text-graphite-500">
                    <span className="stat">{result.key}</span>
                    {result.location && ` · ${result.location}`}
                    {formatEventDates(result.startDate, result.endDate) &&
                      ` · ${formatEventDates(result.startDate, result.endDate)}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button
        type="submit"
        disabled={syncing || query.trim().length < 2}
        className="btn-primary px-4 py-2"
      >
        {syncing ? "Syncing…" : "Sync"}
      </button>
    </form>
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
              <td className="stat px-3 py-2 font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  {t.teamNumber}
                  <ReliabilityWarning teamNumber={t.teamNumber} />
                </span>
              </td>
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

/** Upload glyph for the pit-map drop zone; matches the app's inline-SVG icons. */
function UploadIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6 text-graphite-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
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
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  // Compress a dropped/picked image to a data URL and store it inline (see
  // imageFile.ts) — no Storage bucket needed, works with the existing <img>.
  async function handleImageFile(file: File) {
    setSaveError(null);
    if (!isImageFile(file)) {
      setSaveError("Drop an image file (PNG, JPG, etc.).");
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      await savePitMap(dataUrl);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Couldn't add that image.",
      );
    } finally {
      setUploading(false);
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
              ? "Drag an image in from your desktop, or paste an image URL."
              : "Your admin can add it here for the whole team."}
          </p>
        </div>

        {isAdmin && (
          <>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file) void handleImageFile(file);
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition ${
                dragOver
                  ? "border-maroon-500 bg-maroon-50 text-maroon-700 dark:text-maroon-300"
                  : "border-graphite-300 text-graphite-500 hover:border-graphite-400"
              }`}
            >
              <UploadIcon />
              <span className="font-medium">
                {uploading
                  ? "Adding image…"
                  : dragOver
                    ? "Drop to upload"
                    : "Drag a pit map image here"}
              </span>
              <span className="text-xs text-graphite-400">
                or click to choose a file
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageFile(file);
                e.target.value = "";
              }}
            />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (pitMapUrl.trim()) void savePitMap(pitMapUrl.trim());
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="url"
                placeholder="https://… (or paste an image URL)"
                value={pitMapUrl}
                onChange={(e) => setPitMapUrl(e.target.value)}
                className={`${inputClass} w-72`}
              />
              <button
                type="submit"
                disabled={!pitMapUrl.trim()}
                className="btn-secondary px-4 py-2"
              >
                {pitMap ? "Replace with URL" : "Add URL"}
              </button>
            </form>
          </>
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
                    <span className="inline-flex items-center gap-1.5">
                      {row.teamNumber}
                      <ReliabilityWarning teamNumber={row.teamNumber} />
                    </span>
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
