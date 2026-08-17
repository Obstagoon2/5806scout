"use client";

import type { PitMap, PitMapArrow, PitMapBox } from "@/lib/nexus";
import { useState } from "react";

/**
 * Renders the Nexus pit map as SVG. Coordinates come straight from Nexus in
 * map units (10 units ≈ 1 foot) with the origin at the top-left, which maps
 * 1:1 onto an SVG viewBox — no projection needed, just a zoom multiplier so a
 * 200-pit map is still readable on a phone.
 */

const ZOOM_LEVELS = [1, 2, 3] as const;

const ARROW_STROKE: Record<PitMapArrow["color"], string> = {
  red: "stroke-maroon-500",
  blue: "stroke-sky-700",
  purple: "stroke-graphite-500",
  gray: "stroke-graphite-400",
};

function transform(box: PitMapBox): string | undefined {
  return box.angle ? `rotate(${box.angle} ${box.x} ${box.y})` : undefined;
}

/** Labels are sized off the box so a wide area and a small pit both fit. */
function fontSize(box: PitMapBox, ratio: number): number {
  return Math.max(4, Math.min(box.width, box.height) * ratio);
}

/**
 * A pit box carries two different things a scout needs: which team is in it,
 * and the address posted on it that gets you there. The team number is the
 * headline; the address sits under it, and stands alone as the only label
 * when the event hasn't assigned teams to pits yet.
 */
function Pit({ pit, mine }: { pit: PitMapBox; mine: boolean }) {
  const team = pit.label;
  return (
    <g transform={transform(pit)}>
      <rect
        x={pit.x - pit.width / 2}
        y={pit.y - pit.height / 2}
        width={pit.width}
        height={pit.height}
        rx={2}
        className={
          mine
            ? "fill-maroon-600 stroke-maroon-900"
            : "fill-surface stroke-graphite-300"
        }
        strokeWidth={1}
      />
      {team ? (
        <>
          <text
            x={pit.x}
            y={pit.y - pit.height * 0.08}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize(pit, 0.34)}
            className={`stat font-semibold ${mine ? "fill-white" : "fill-graphite-800"}`}
          >
            {team}
          </text>
          <text
            x={pit.x}
            y={pit.y + pit.height * 0.24}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={fontSize(pit, 0.18)}
            className={`stat ${mine ? "fill-maroon-100" : "fill-graphite-400"}`}
          >
            {pit.id}
          </text>
        </>
      ) : (
        <text
          x={pit.x}
          y={pit.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize(pit, 0.26)}
          className={`stat ${mine ? "fill-white" : "fill-graphite-500"}`}
        >
          {pit.id}
        </text>
      )}
    </g>
  );
}

function Area({ area }: { area: PitMapBox }) {
  return (
    <g transform={transform(area)}>
      <rect
        x={area.x - area.width / 2}
        y={area.y - area.height / 2}
        width={area.width}
        height={area.height}
        rx={2}
        className="fill-graphite-100 stroke-graphite-300"
        strokeWidth={1}
      />
      {area.label && (
        <text
          x={area.x}
          y={area.y}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize(area, 0.22)}
          className="fill-graphite-600 font-medium"
        >
          {area.label}
        </text>
      )}
    </g>
  );
}

function Arrow({ arrow }: { arrow: PitMapArrow }) {
  const half = arrow.height / 2;
  const head = Math.min(arrow.width, arrow.height) / 2.5;
  const top = arrow.y - half;
  const bottom = arrow.y + half;
  const stroke = ARROW_STROKE[arrow.color] ?? ARROW_STROKE.blue;

  return (
    <g transform={transform(arrow)} className={stroke} strokeWidth={2} fill="none">
      <line x1={arrow.x} y1={top} x2={arrow.x} y2={bottom} />
      <polyline
        points={`${arrow.x - head},${top + head} ${arrow.x},${top} ${arrow.x + head},${top + head}`}
      />
      {arrow.direction === "double" && (
        <polyline
          points={`${arrow.x - head},${bottom - head} ${arrow.x},${bottom} ${arrow.x + head},${bottom - head}`}
        />
      )}
    </g>
  );
}

export function NexusPitMap({
  map,
  highlightTeam,
}: {
  map: PitMap;
  /** Our team number — its pit is filled maroon so it's findable at a glance. */
  highlightTeam: string | null;
}) {
  const [zoom, setZoom] = useState<number>(1);

  if (map.width <= 0 || map.height <= 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="section-title">Zoom</span>
        {ZOOM_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setZoom(level)}
            aria-pressed={zoom === level}
            className={`stat rounded px-2 py-1 text-xs font-semibold transition ${
              zoom === level
                ? "bg-maroon-600 text-white"
                : "bg-graphite-100 text-graphite-600 hover:text-graphite-900"
            }`}
          >
            {level === 1 ? "Fit" : `${level}×`}
          </button>
        ))}
      </div>

      <div className="overflow-auto rounded-lg border border-graphite-200 bg-surface p-2">
        <svg
          viewBox={`0 0 ${map.width} ${map.height}`}
          width={`${zoom * 100}%`}
          role="img"
          aria-label={
            highlightTeam
              ? `Pit map. Team ${highlightTeam}'s pit is highlighted.`
              : "Pit map"
          }
          className="h-auto min-w-full"
        >
          {map.walls.map((wall) => (
            <rect
              key={wall.id}
              x={wall.x - wall.width / 2}
              y={wall.y - wall.height / 2}
              width={wall.width}
              height={wall.height}
              transform={transform(wall)}
              className="fill-graphite-300"
            />
          ))}
          {map.areas.map((area) => (
            <Area key={area.id} area={area} />
          ))}
          {map.pits.map((pit) => (
            <Pit
              key={pit.id}
              pit={pit}
              mine={highlightTeam !== null && pit.label === highlightTeam}
            />
          ))}
          {map.arrows.map((arrow) => (
            <Arrow key={arrow.id} arrow={arrow} />
          ))}
          {map.labels.map((label) => (
            <text
              key={label.id}
              x={label.x}
              y={label.y}
              transform={transform(label)}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={fontSize(label, 0.4)}
              className="fill-graphite-500 font-semibold uppercase tracking-wide"
            >
              {label.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
