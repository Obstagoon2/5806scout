"use client";

import {
  ALLIANCE_COUNT,
  ALLIANCE_SIZE,
  SLOT_LABELS,
  allianceTeams,
  type AllianceSlots,
  type AllianceStrength,
} from "@/lib/alliances";
import type { EventTeam } from "@/lib/eventData";

/**
 * The eight playoff alliances, three slots apiece. Two ways to fill a slot:
 * "select" hands each slot a dropdown (fast for an admin tracking the real
 * selection), "place" waits for a team to be picked from a list alongside
 * (the Simulation tab's side-by-side board).
 */
export function AllianceBoard({
  slots,
  teamsByNumber,
  availableTeams,
  strengths,
  odds,
  mode,
  editable,
  pendingTeam,
  onAssign,
  columns = 2,
}: {
  slots: AllianceSlots;
  teamsByNumber: ReadonlyMap<number, EventTeam>;
  /** Teams that may still be dropped into a slot, in ranked order. */
  availableTeams: readonly number[];
  strengths: readonly AllianceStrength[];
  /** Championship chance per alliance, or null while the board is unfilled. */
  odds: readonly number[] | null;
  mode: "select" | "place";
  editable: boolean;
  /** In "place" mode, the team a tap on an empty slot will seat. */
  pendingTeam?: number | null;
  onAssign: (alliance: number, slot: number, team: number | null) => void;
  columns?: 1 | 2;
}) {
  return (
    <div
      className={`grid gap-3 ${columns === 2 ? "sm:grid-cols-2" : ""}`}
    >
      {Array.from({ length: ALLIANCE_COUNT }, (_, alliance) => {
        const teams = allianceTeams(slots, alliance);
        const strength = strengths[alliance];
        const chance = odds?.[alliance] ?? null;
        return (
          <section
            key={alliance}
            className="surface-card flex flex-col gap-2 p-3"
          >
            <header className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-graphite-900">
                Alliance <span className="stat">{alliance + 1}</span>
              </h3>
              <span className="stat text-xs text-graphite-500">
                {strength && strength.emptySlots < ALLIANCE_SIZE
                  ? `${strength.points.toFixed(1)} pts`
                  : "—"}
              </span>
            </header>

            <ul className="flex flex-col gap-1.5">
              {teams.map((team, slot) => (
                <li key={slot} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs uppercase tracking-wider text-graphite-500">
                    {SLOT_LABELS[slot]}
                  </span>
                  <AllianceSlot
                    alliance={alliance}
                    slot={slot}
                    team={team}
                    teamsByNumber={teamsByNumber}
                    availableTeams={availableTeams}
                    mode={mode}
                    editable={editable}
                    pendingTeam={pendingTeam ?? null}
                    onAssign={onAssign}
                  />
                </li>
              ))}
            </ul>

            {chance !== null && (
              <div className="flex items-center gap-2 border-t border-graphite-100 pt-2">
                <div
                  className="h-1.5 flex-1 bg-graphite-100"
                  role="presentation"
                >
                  <div
                    className="h-full bg-maroon-600"
                    style={{ width: `${Math.min(100, chance * 100)}%` }}
                  />
                </div>
                <span className="stat w-14 shrink-0 text-right text-sm font-semibold text-maroon-700 dark:text-maroon-300">
                  {(chance * 100).toFixed(1)}%
                </span>
              </div>
            )}

            {strength && strength.unknownTeams.length > 0 && (
              <p className="text-xs text-graphite-500">
                No data yet for{" "}
                <span className="stat">{strength.unknownTeams.join(", ")}</span>
                {" — this alliance's points are partial."}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AllianceSlot({
  alliance,
  slot,
  team,
  teamsByNumber,
  availableTeams,
  mode,
  editable,
  pendingTeam,
  onAssign,
}: {
  alliance: number;
  slot: number;
  team: number | null;
  teamsByNumber: ReadonlyMap<number, EventTeam>;
  availableTeams: readonly number[];
  mode: "select" | "place";
  editable: boolean;
  pendingTeam: number | null;
  onAssign: (alliance: number, slot: number, team: number | null) => void;
}) {
  const label = `Alliance ${alliance + 1} ${SLOT_LABELS[slot]}`;

  if (!editable) {
    return (
      <span className="stat flex-1 border border-graphite-200 bg-graphite-50 px-2 py-1 text-sm">
        {team ?? "—"}
      </span>
    );
  }

  if (mode === "select") {
    // Whatever already sits here has to stay in its own options list, or
    // selecting it back after a change would be impossible.
    const options = team !== null ? [team, ...availableTeams] : availableTeams;
    return (
      <select
        aria-label={label}
        value={team ?? ""}
        onChange={(e) =>
          onAssign(alliance, slot, e.target.value === "" ? null : Number(e.target.value))
        }
        className="stat w-full flex-1 border border-graphite-200 bg-transparent px-2 py-1 text-sm text-graphite-900 transition hover:border-graphite-300"
      >
        <option value="">—</option>
        {options.map((teamNumber) => (
          <option key={teamNumber} value={teamNumber}>
            {teamNumber}
            {teamsByNumber.get(teamNumber)?.nickname
              ? ` · ${teamsByNumber.get(teamNumber)?.nickname}`
              : ""}
          </option>
        ))}
      </select>
    );
  }

  const canSeat = team === null && pendingTeam !== null;
  return (
    <button
      type="button"
      aria-label={
        team !== null ? `Clear ${label}` : `Seat ${pendingTeam ?? "a team"} in ${label}`
      }
      onClick={() => onAssign(alliance, slot, team !== null ? null : pendingTeam)}
      disabled={team === null && pendingTeam === null}
      className={`stat flex-1 border px-2 py-1 text-left text-sm transition ${
        team !== null
          ? "border-graphite-300 text-graphite-900 hover:border-maroon-400 hover:text-maroon-700 dark:hover:text-maroon-300"
          : canSeat
            ? "border-dashed border-maroon-400 text-maroon-700 dark:text-maroon-300 hover:bg-maroon-50"
            : "border-dashed border-graphite-200 text-graphite-400"
      }`}
      title={team !== null ? "Tap to clear" : "Pick a team from the list, then tap here"}
    >
      {team ?? (canSeat ? `+ ${pendingTeam}` : "—")}
    </button>
  );
}
