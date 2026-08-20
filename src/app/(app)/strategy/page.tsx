"use client";

import { useFieldImage } from "@/components/FieldSketchPad";
import {
  exportBoardImage,
  StrategyBoardCanvas,
  type BoardOverlay,
  type BoardTool,
} from "@/components/StrategyBoardCanvas";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { EventData, EventMatch } from "@/lib/eventData";
import { db } from "@/lib/firebase/client";
import {
  parseStrokes,
  PEN_COLORS,
  recolorStrokes,
  serializeStrokes,
  sketchAlliance,
  strokesForAlliance,
  type SketchStroke,
} from "@/lib/fieldSketch";
import {
  autoDisplayName,
  parseAutoPaths,
  parseAutos,
  withPaths,
  type PitAutoWithPath,
} from "@/lib/pitAutos";
import { PIT_MEDIA_COLLECTION } from "@/lib/pitScoutSchema";
import {
  ALLIANCE_COLORS,
  autoSelectionKey,
  BOARD_PHASES,
  DEFAULT_PHASE,
  matchLabel,
  matchSlots,
  nextUpcomingMatch,
  parseBoardState,
  phaseTokens,
  phaseUsesAutos,
  type BoardSlot,
  type BoardState,
  type PhaseId,
  type TokenPosition,
} from "@/lib/strategyBoard";
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// The Strategy Board. Admin-only (see src/lib/nav.ts): it is the one surface
// where a plan is authored for everyone else to follow, and a scout redrawing
// it mid-event is a worse failure than a scout not having it.
//
// Five phases per match, each its own field. Only Auto pulls in scouted auto
// paths — the rest are plans, with nothing recorded to lay underneath.
//
// Two stores, on purpose. What was OBSERVED — the schedule, the pit-scouted
// autos — is read from dataTeamId, the canonical store a linked sister pair
// shares. The board itself is written to the team's own id, so a pair pools
// its scouting but never sees the plan the other side drew from it. Same
// carve-out the picklist makes, for the same reason.

export default function StrategyPage() {
  const { dataTeamId, profile, user } = useAuth();
  const field = useFieldImage();

  const [event, setEvent] = useState<EventData | null>(null);
  const [matchKey, setMatchKey] = useState<string | null>(null);
  const [phase, setPhase] = useState<PhaseId>(DEFAULT_PHASE);
  // Tagged with the match it came from, so a snapshot still in flight when the
  // admin switches matches renders as "not loaded yet" instead of being reset
  // by an effect (the same shape AuthProvider uses for its team doc).
  const [boardState, setBoardState] = useState<{
    matchKey: string;
    board: BoardState;
  } | null>(null);
  const [tool, setTool] = useState<BoardTool>("pen");
  const [color, setColor] = useState<string>(PEN_COLORS[0].value);
  const [autosByTeam, setAutosByTeam] = useState<
    Record<string, PitAutoWithPath[]>
  >({});
  const [error, setError] = useState<string | null>(null);

  // The board revision this client last wrote. A live listener is what lets a
  // second admin see the plan appear, but it also echoes our own writes back —
  // and applying that echo mid-stroke would snap the pen out from under the
  // finger. Compared against the document's `revision` to tell the two apart.
  const revision = useRef<string>("");

  useEffect(() => {
    if (!dataTeamId) return;
    return onSnapshot(
      doc(db, "teams", dataTeamId, "config", "event"),
      (snapshot) =>
        setEvent(snapshot.exists() ? (snapshot.data() as EventData) : null),
      () => setError("Couldn't load the event schedule."),
    );
  }, [dataTeamId]);

  const matches = useMemo(() => event?.matches ?? [], [event]);

  // Open on the next unplayed match, and stay there once an admin picks
  // another — re-deriving on every schedule sync would drag them back.
  const selectedMatch: EventMatch | null = useMemo(() => {
    if (matchKey) {
      const chosen = matches.find((m) => m.key === matchKey);
      if (chosen) return chosen;
    }
    return nextUpcomingMatch(matches);
  }, [matchKey, matches]);

  const slots: BoardSlot[] = useMemo(
    () => (selectedMatch ? matchSlots(selectedMatch) : []),
    [selectedMatch],
  );

  // Board document: live, so two strategists on THIS team see one plan. Keyed
  // by the team's own id, never dataTeamId — see the note at the top.
  const boardTeamId = profile?.teamId ?? null;

  useEffect(() => {
    if (!boardTeamId || !selectedMatch) return;
    revision.current = "";
    const key = selectedMatch.key;
    return onSnapshot(
      doc(db, "teams", boardTeamId, "strategyBoards", key),
      (snapshot) => {
        const data = snapshot.data();
        // Our own echo. Anything else is a teammate's edit and wins, because
        // the alternative is two admins each convinced they saved.
        if (data?.revision === revision.current) return;
        setBoardState({ matchKey: key, board: parseBoardState(data) });
      },
      () => setError("Couldn't load this match's board."),
    );
  }, [boardTeamId, selectedMatch]);

  // A board that hasn't loaded (or belongs to the match we just left) renders
  // as an empty field rather than as the previous match's plan.
  const emptyBoard = useMemo(() => parseBoardState(null), []);
  const board =
    selectedMatch && boardState?.matchKey === selectedMatch.key
      ? boardState.board
      : emptyBoard;

  // The six robots' scouted autos, fetched per match rather than listened to:
  // pit data changes on a scout's timescale, not a strategist's, and six live
  // document listeners per match switch is a lot of socket for that.
  useEffect(() => {
    if (!dataTeamId || !selectedMatch) return;
    let cancelled = false;
    const teams = matchSlots(selectedMatch).map((slot) => slot.teamNumber);

    void Promise.all(
      teams.map(async (teamNumber) => {
        const id = String(teamNumber);
        const [core, media] = await Promise.all([
          getDoc(doc(db, "teams", dataTeamId, "pitScouting", id)).catch(
            () => null,
          ),
          getDoc(doc(db, "teams", dataTeamId, PIT_MEDIA_COLLECTION, id)).catch(
            () => null,
          ),
        ]);
        return [
          id,
          withPaths(
            parseAutos(core?.data()?.autos),
            parseAutoPaths(media?.data()?.autoPaths),
          ),
        ] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setAutosByTeam(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [dataTeamId, selectedMatch]);

  const phaseState = board.phases[phase];
  const strokes = useMemo(
    () => parseStrokes(phaseState.strokes),
    [phaseState.strokes],
  );
  const tokens = useMemo(
    () => (selectedMatch ? phaseTokens(phaseState, selectedMatch) : {}),
    [phaseState, selectedMatch],
  );

  // Every ticked auto, moved onto the alliance the robot is actually on this
  // match and recolored to match, so three paths over one field still say who
  // is who. A robot scouted on red and drawn there plays the same auto from
  // the other end two matches later — see strokesForAlliance.
  const overlays: BoardOverlay[] = useMemo(() => {
    if (!phaseUsesAutos(phase)) return [];
    const result: BoardOverlay[] = [];
    for (const slot of slots) {
      for (const auto of autosByTeam[String(slot.teamNumber)] ?? []) {
        const key = autoSelectionKey(slot.teamNumber, auto.id);
        if (!board.selectedAutos.includes(key)) continue;
        result.push({
          key,
          strokes: recolorStrokes(
            strokesForAlliance(auto.strokes, slot.alliance),
            ALLIANCE_COLORS[slot.alliance],
          ),
        });
      }
    }
    return result;
  }, [autosByTeam, board.selectedAutos, phase, slots]);

  const save = useCallback(
    (next: BoardState) => {
      if (!boardTeamId || !selectedMatch || !profile || !user) return;
      // Random rather than a timestamp: two admins saving in the same
      // millisecond would otherwise each mistake the other's write for their
      // own echo and never see it.
      const stamp = crypto.randomUUID();
      revision.current = stamp;
      void setDoc(
        doc(db, "teams", boardTeamId, "strategyBoards", selectedMatch.key),
        {
          matchKey: selectedMatch.key,
          phases: next.phases,
          selectedAutos: next.selectedAutos,
          revision: stamp,
          updatedByUid: user.uid,
          updatedByName: profile.fullName,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(() =>
        setError(
          "Couldn't save the board — your last change is only on this device.",
        ),
      );
    },
    [boardTeamId, profile, selectedMatch, user],
  );

  function writeBoard(next: BoardState) {
    if (!selectedMatch) return;
    setBoardState({ matchKey: selectedMatch.key, board: next });
  }

  /** Draw locally on every pointer move; write once per finished gesture. */
  function updatePhase(next: Partial<BoardState["phases"][PhaseId]>) {
    writeBoard({
      ...board,
      phases: {
        ...board.phases,
        [phase]: { ...board.phases[phase], ...next },
      },
    });
  }

  /** Read the latest state through the setter rather than the render closure —
   *  a pointerup batched with its last pointermove would otherwise save the
   *  stroke one point short. */
  function commit() {
    setError(null);
    setBoardState((current) => {
      if (current) save(current.board);
      return current;
    });
  }

  function toggleAuto(key: string) {
    setError(null);
    const next = {
      ...board,
      selectedAutos: board.selectedAutos.includes(key)
        ? board.selectedAutos.filter((k) => k !== key)
        : [...board.selectedAutos, key],
    };
    writeBoard(next);
    save(next);
  }

  function clearPhase() {
    if (!window.confirm(`Clear everything drawn on ${phaseLabel(phase)}?`)) {
      return;
    }
    setError(null);
    const next = {
      ...board,
      phases: { ...board.phases, [phase]: { strokes: "", tokens: {} } },
    };
    writeBoard(next);
    save(next);
  }

  function handleExport() {
    const dataUrl = exportBoardImage(field, strokes, overlays, tokens, slots);
    if (!dataUrl || !selectedMatch) {
      setError("Couldn't build the image — try again.");
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${matchLabel(selectedMatch).replace(/\s+/g, "-").toLowerCase()}-${phase}.png`;
    link.click();
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-graphite-900">
          <span aria-hidden className="h-5 w-1.5 bg-maroon-600" />
          Strategy Board
        </h1>
        <p className="mt-1 text-sm text-graphite-500">
          One board per match, five phases deep. Everything you draw is shared
          with the team the moment you lift your finger.
        </p>
      </div>

      {matches.length === 0 ? (
        <p className="surface-card px-4 py-8 text-center text-sm text-graphite-500">
          No match schedule yet — sync an event on the Event tab and the board
          will open on the next match.
        </p>
      ) : (
        <>
          <MatchPicker
            matches={matches}
            selected={selectedMatch}
            onSelect={(key) => {
              setMatchKey(key);
              setPhase(DEFAULT_PHASE);
            }}
          />

          <PhaseTabs phase={phase} onSelect={setPhase} />

          {error && (
            <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="text-xs italic text-graphite-500">
                {BOARD_PHASES.find((p) => p.id === phase)?.blurb}
              </p>

              <StrategyBoardCanvas
                strokes={strokes}
                onStrokesChange={(next: SketchStroke[]) =>
                  updatePhase({ strokes: serializeStrokes(next) })
                }
                onCommit={commit}
                tokens={tokens}
                onTokenMove={(teamNumber, position: TokenPosition) =>
                  updatePhase({
                    tokens: { ...tokens, [String(teamNumber)]: position },
                  })
                }
                slots={slots}
                overlays={overlays}
                tool={tool}
                color={color}
              />

              <Toolbar
                tool={tool}
                onToolChange={setTool}
                color={color}
                onColorChange={(next) => {
                  setColor(next);
                  setTool("pen");
                }}
                onUndo={() => {
                  updatePhase({ strokes: serializeStrokes(strokes.slice(0, -1)) });
                  commit();
                }}
                canUndo={strokes.length > 0}
                onClear={clearPhase}
                onExport={handleExport}
              />
            </div>

            <aside className="flex w-full flex-col gap-3 lg:w-80">
              {phaseUsesAutos(phase) ? (
                <AutoPicker
                  slots={slots}
                  autosByTeam={autosByTeam}
                  selected={board.selectedAutos}
                  onToggle={toggleAuto}
                />
              ) : (
                <RosterList slots={slots} />
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

function phaseLabel(phase: PhaseId): string {
  return BOARD_PHASES.find((p) => p.id === phase)?.label ?? phase;
}

function MatchPicker({
  matches,
  selected,
  onSelect,
}: {
  matches: readonly EventMatch[];
  selected: EventMatch | null;
  onSelect: (key: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 sm:max-w-xs">
      <span className="text-sm font-medium text-graphite-700">Match</span>
      <select
        value={selected?.key ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="field-input"
      >
        {matches.map((match) => (
          <option key={match.key} value={match.key}>
            {matchLabel(match)} — {match.red.join(", ")} vs{" "}
            {match.blue.join(", ")}
          </option>
        ))}
      </select>
    </label>
  );
}

function PhaseTabs({
  phase,
  onSelect,
}: {
  phase: PhaseId;
  onSelect: (phase: PhaseId) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Match phase"
      className="flex flex-wrap border-b border-graphite-200"
    >
      {BOARD_PHASES.map((entry) => {
        const active = entry.id === phase;
        return (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(entry.id)}
            className={`border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              active
                ? "border-maroon-600 text-maroon-700 dark:text-maroon-300"
                : "border-transparent text-graphite-500 hover:border-graphite-200 hover:text-graphite-900"
            }`}
          >
            {entry.label}
          </button>
        );
      })}
    </div>
  );
}

function Toolbar({
  tool,
  onToolChange,
  color,
  onColorChange,
  onUndo,
  canUndo,
  onClear,
  onExport,
}: {
  tool: BoardTool;
  onToolChange: (tool: BoardTool) => void;
  color: string;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  onClear: () => void;
  onExport: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PEN_COLORS.map((pen) => (
        <button
          key={pen.value}
          type="button"
          aria-label={pen.name}
          aria-pressed={tool === "pen" && color === pen.value}
          onClick={() => onColorChange(pen.value)}
          style={{ backgroundColor: pen.value }}
          className={`h-9 w-9 rounded-full border-2 transition ${
            tool === "pen" && color === pen.value
              ? "border-graphite-900 dark:border-graphite-100"
              : "border-transparent"
          }`}
        />
      ))}
      <button
        type="button"
        aria-pressed={tool === "eraser"}
        onClick={() => onToolChange(tool === "eraser" ? "pen" : "eraser")}
        className={`btn-secondary px-3 py-2 ${
          tool === "eraser"
            ? "border-maroon-600 text-maroon-700 dark:text-maroon-300"
            : ""
        }`}
      >
        Eraser
      </button>
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className="btn-secondary ml-auto px-3 py-2 disabled:opacity-40"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onClear}
        className="btn-secondary px-3 py-2"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onExport}
        className="btn-secondary px-3 py-2"
      >
        Export
      </button>
    </div>
  );
}

function AutoPicker({
  slots,
  autosByTeam,
  selected,
  onToggle,
}: {
  slots: readonly BoardSlot[];
  autosByTeam: Record<string, PitAutoWithPath[]>;
  selected: readonly string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="surface-card flex flex-col divide-y divide-graphite-100">
      <p className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-maroon-700 dark:text-maroon-300">
        Scouted autos
      </p>
      {slots.map((slot) => {
        const autos = autosByTeam[String(slot.teamNumber)] ?? [];
        return (
          <div key={slot.teamNumber} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: ALLIANCE_COLORS[slot.alliance] }}
              />
              <span className="stat text-sm font-semibold text-graphite-900">
                {slot.teamNumber}
              </span>
            </div>
            {autos.length === 0 ? (
              <p className="text-xs text-graphite-500">
                Nothing scouted in the pit yet.
              </p>
            ) : (
              autos.map((auto, index) => {
                const key = autoSelectionKey(slot.teamNumber, auto.id);
                return (
                  <label
                    key={auto.id}
                    className="flex cursor-pointer items-start gap-2.5 text-sm text-graphite-700"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(key)}
                      onChange={() => onToggle(key)}
                      className="mt-0.5 h-4 w-4 accent-maroon-600"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-graphite-900">
                        {autoDisplayName(auto, index)}
                      </span>
                      {auto.strokes.length === 0 ? (
                        <span className="block text-xs italic text-graphite-400">
                          No path drawn — nothing to show on the field.
                        </span>
                      ) : (
                        sketchAlliance(auto.strokes) !== slot.alliance && (
                          <span className="block text-xs italic text-graphite-500">
                            Scouted on {sketchAlliance(auto.strokes)} — turned
                            around for this match.
                          </span>
                        )
                      )}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The other four phases have no autos to offer, but still need to say which
 *  robot each marker is. */
function RosterList({ slots }: { slots: readonly BoardSlot[] }) {
  return (
    <div className="surface-card flex flex-col divide-y divide-graphite-100">
      <p className="px-4 py-3 text-xs font-semibold uppercase tracking-widest text-maroon-700 dark:text-maroon-300">
        On the field
      </p>
      {slots.map((slot) => (
        <div
          key={slot.teamNumber}
          className="flex items-center gap-2 px-4 py-2.5"
        >
          <span
            aria-hidden
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: ALLIANCE_COLORS[slot.alliance] }}
          />
          <span className="stat text-sm font-semibold text-graphite-900">
            {slot.teamNumber}
          </span>
          <span className="ml-auto text-xs uppercase tracking-widest text-graphite-400">
            {slot.alliance}
          </span>
        </div>
      ))}
    </div>
  );
}
