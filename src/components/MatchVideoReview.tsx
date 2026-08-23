"use client";

import type { EventMatch } from "@/lib/eventData";
import {
  allianceOf,
  formatMoment,
  formatVideoTime,
  matchTeams,
  momentAt,
  sortNotes,
  type MatchReviewNote,
} from "@/lib/matchReview";
import { matchLabel } from "@/lib/pitDashboard";
import { useCallback, useEffect, useRef, useState } from "react";

// The film-study surface: one match's video, with notes pinned to moments in
// it. Everything stateful about the match lives in the parent — this owns only
// the player and the composer.

/** The slice of the YouTube IFrame API this uses. */
interface YouTubePlayer {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: () => void };
    },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const IFRAME_API_SRC = "https://www.youtube.com/iframe_api";

/**
 * Resolves once the IFrame API is usable. YouTube hands readiness back through
 * a single global callback, so every caller shares one promise — a second
 * player mounting must not overwrite the first one's hook and strand it.
 */
let apiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YouTube API loaded without a player"));
    };
    if (!document.querySelector(`script[src="${IFRAME_API_SRC}"]`)) {
      const script = document.createElement("script");
      script.src = IFRAME_API_SRC;
      // A venue that blocks YouTube fails here rather than hanging forever on
      // a promise nothing resolves.
      script.onerror = () => reject(new Error("Could not load YouTube"));
      document.head.appendChild(script);
    }
  }).catch((error) => {
    // Let a later mount retry — a dropped connection shouldn't poison the
    // page until reload.
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}

/** How often the moment readout re-reads the player. */
const TICK_MS = 250;

export interface MatchVideoReviewProps {
  match: EventMatch;
  videoKey: string;
  /** Video seconds at which the match starts, and whether a human marked it. */
  offsetSeconds: number;
  offsetConfirmed: boolean;
  /** Match this offset was borrowed from, when it wasn't marked here. */
  inheritedFrom: string | null;
  notes: readonly MatchReviewNote[];
  onMarkStart: (videoSeconds: number) => void;
  onAddNote: (note: { videoSeconds: number; teamNumber: number | null; text: string }) => void;
  onDeleteNote: (noteId: string) => void;
  /** Uid of the signed-in admin, so they can clear their own notes. */
  viewerUid: string;
}

export function MatchVideoReview({
  match,
  videoKey,
  offsetSeconds,
  offsetConfirmed,
  inheritedFrom,
  notes,
  onMarkStart,
  onAddNote,
  onDeleteNote,
  viewerUid,
}: MatchVideoReviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  // Each of these is keyed by the clip it describes rather than reset from the
  // effect that rebuilds the player: swapping clips then clears them as a
  // derived value, with no window where a new video is showing an old one's
  // position or error.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);
  const [position, setPosition] = useState<{ key: string; seconds: number }>({
    key: videoKey,
    seconds: 0,
  });
  const ready = readyFor === videoKey;
  const playerError = errorFor === videoKey;
  const videoSeconds = position.key === videoKey ? position.seconds : 0;

  const [draft, setDraft] = useState("");
  const [draftTeam, setDraftTeam] = useState<number | null>(null);
  // Frozen the moment the composer is opened, so a note lands on the play the
  // admin saw rather than wherever the video drifted to while they typed.
  const [draftAt, setDraftAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi()
      .then((api) => {
        if (cancelled || !mountRef.current) return;
        playerRef.current = new api.Player(mountRef.current, {
          videoId: videoKey,
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
          events: { onReady: () => !cancelled && setReadyFor(videoKey) },
        });
      })
      .catch(() => !cancelled && setErrorFor(videoKey));
    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoKey]);

  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      // getCurrentTime throws on a player torn down between tick and read.
      try {
        setPosition({ key: videoKey, seconds: player.getCurrentTime() });
      } catch {
        /* next tick picks it back up, or the effect cleans up */
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [ready, videoKey]);

  const seek = useCallback(
    (seconds: number) => {
      const player = playerRef.current;
      if (!player) return;
      try {
        player.seekTo(Math.max(0, seconds), true);
        setPosition({ key: videoKey, seconds: Math.max(0, seconds) });
      } catch {
        /* the player is going away — nothing to seek */
      }
    },
    [videoKey],
  );

  const teams = matchTeams(match);
  const moment = momentAt(videoSeconds, offsetSeconds);
  const composerAt = draftAt ?? videoSeconds;
  const composerMoment = momentAt(composerAt, offsetSeconds);
  const ordered = sortNotes(notes);

  function openComposer(team: number | null) {
    setDraftAt(videoSeconds);
    setDraftTeam(team);
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    onAddNote({ videoSeconds: composerAt, teamNumber: draftTeam, text });
    setDraft("");
    setDraftTeam(null);
    setDraftAt(null);
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="surface-card overflow-hidden">
          {playerError ? (
            <div className="flex flex-col items-start gap-2 p-4">
              <p className="text-sm text-graphite-600">
                Couldn&apos;t load the YouTube player — the venue network may be
                blocking it.
              </p>
              <a
                className="btn-secondary"
                href={`https://www.youtube.com/watch?v=${videoKey}`}
                target="_blank"
                rel="noreferrer"
              >
                Open on YouTube
              </a>
            </div>
          ) : (
            <div className="relative aspect-video w-full bg-graphite-900">
              <div ref={mountRef} className="absolute inset-0 h-full w-full" />
            </div>
          )}
        </div>

        <div className="surface-panel flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
          <div className="flex items-baseline gap-2">
            <span className="stat text-lg font-semibold text-graphite-900">
              {formatMoment(moment)}
            </span>
            {moment.shift && (
              <span className="text-xs text-graphite-500">{moment.shift}</span>
            )}
          </div>
          <span className="stat text-xs text-graphite-400">
            video {formatVideoTime(videoSeconds)}
          </span>
          <button
            type="button"
            className="btn-ghost ml-auto"
            onClick={() => onMarkStart(videoSeconds)}
            disabled={!ready}
          >
            {offsetConfirmed ? "Re-mark match start" : "Mark match start"}
          </button>
        </div>

        {!offsetConfirmed && (
          <p className="text-xs text-graphite-500">
            {inheritedFrom ? (
              <>
                Match start is <span className="stat">estimated</span> from{" "}
                {inheritedFrom.split("_")[1]?.toUpperCase() ?? inheritedFrom} —
                scrub to the green flag and mark it to be sure.
              </>
            ) : (
              <>
                Nobody has marked where this clip starts, so timestamps are
                measured from frame one. Scrub to the green flag and hit{" "}
                <span className="font-semibold">Mark match start</span>.
              </>
            )}
          </p>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 lg:max-w-sm">
        <div className="surface-card flex flex-col gap-3 p-4">
          <h3 className="flex items-baseline justify-between gap-2">
            <span className="section-title">Note at</span>
            <span className="stat text-xs text-graphite-500">
              {formatMoment(composerMoment)}
            </span>
          </h3>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => openComposer(null)}
              aria-pressed={draftTeam === null}
              className={`stat rounded border px-2 py-1 text-xs font-semibold transition ${
                draftTeam === null
                  ? "border-graphite-700 bg-graphite-700 text-white"
                  : "border-graphite-200 text-graphite-600 hover:border-graphite-300"
              }`}
            >
              Match
            </button>
            {teams.map((team) => {
              const selected = draftTeam === team;
              const red = allianceOf(match, team) === "red";
              return (
                <button
                  key={team}
                  type="button"
                  onClick={() => openComposer(team)}
                  aria-pressed={selected}
                  className={`stat rounded border px-2 py-1 text-xs font-semibold transition ${
                    selected
                      ? red
                        ? "border-maroon-600 bg-maroon-600 text-white"
                        : "border-sky-700 bg-sky-700 text-white"
                      : red
                        ? "border-maroon-200 text-maroon-700 hover:border-maroon-400 dark:text-maroon-300"
                        : "border-sky-300 text-sky-700 hover:border-sky-700"
                  }`}
                >
                  {team}
                </button>
              );
            })}
          </div>

          <textarea
            className="field-input min-h-20 resize-y"
            placeholder="What happened here?"
            value={draft}
            onFocus={() => draftAt === null && setDraftAt(videoSeconds)}
            onChange={(e) => setDraft(e.target.value)}
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={submit}
              disabled={!draft.trim()}
            >
              Pin note
            </button>
            {draftAt !== null && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setDraftAt(null)}
                title="Re-stamp this note at the current video position"
              >
                Re-stamp
              </button>
            )}
          </div>
        </div>

        <div className="surface-card flex flex-col gap-2 p-4">
          <h3 className="flex items-baseline justify-between gap-2">
            <span className="section-title">
              Notes — {matchLabel(match)}
            </span>
            <span className="stat text-xs text-graphite-500">{ordered.length}</span>
          </h3>

          {ordered.length === 0 ? (
            <p className="text-sm text-graphite-500">
              No notes yet. Pause on something worth remembering and pin it.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-graphite-100">
              {ordered.map((note) => {
                const at = momentAt(note.videoSeconds, offsetSeconds);
                const red =
                  note.teamNumber !== null &&
                  allianceOf(match, note.teamNumber) === "red";
                return (
                  <li key={note.id} className="flex flex-col gap-1 py-2 first:pt-0">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => seek(note.videoSeconds)}
                        className="stat rounded bg-graphite-100 px-1.5 py-0.5 text-xs font-semibold text-graphite-700 transition hover:bg-graphite-200"
                      >
                        {formatMoment(at)}
                      </button>
                      {note.teamNumber !== null && (
                        <span
                          className={`stat text-xs font-semibold ${
                            red
                              ? "text-maroon-700 dark:text-maroon-300"
                              : "text-sky-700"
                          }`}
                        >
                          {note.teamNumber}
                        </span>
                      )}
                      {note.authorUid === viewerUid && (
                        <button
                          type="button"
                          className="btn-ghost ml-auto"
                          onClick={() => onDeleteNote(note.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-graphite-900">
                      {note.text}
                    </p>
                    <p className="text-xs text-graphite-400">{note.authorName}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
