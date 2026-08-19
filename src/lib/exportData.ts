// CSV and archive assembly for the Team tab's export button.
//
// Kept pure and separate from the component: what ends up in a scouting
// season's export is worth testing, and none of it needs Firestore to check.
//
// CSV rather than JSON because the destination is a spreadsheet — a lead
// pulling season data into Sheets to slice it their own way, or an archive
// that outlives this app.

import { mediaFieldIds } from "@/lib/formMedia";
import type { FormSection, FormValues } from "@/lib/formSchema";
import { dataUrlBytes, type ZipEntry } from "@/lib/zip";

export interface PitEntry {
  team: string;
  scoutName: string;
  values: FormValues;
}

export interface MatchEntry {
  matchNumber: number;
  scoutedTeam: string;
  alliance: string;
  scoutName: string;
  values: FormValues;
}

/**
 * One CSV cell. Quoted whenever the value could otherwise break the row —
 * a comma, a quote, or a newline inside a scout's free-text note would
 * silently shift every column after it.
 */
export function csvCell(value: unknown): string {
  const text = renderValue(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  // Multiselects hold an array; semicolons keep them in one cell.
  if (Array.isArray(value)) return value.join("; ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function toCsv(rows: readonly (readonly unknown[])[]): string {
  // CRLF and a UTF-8 BOM: Excel reads a plain UTF-8 CSV as Latin-1 and turns
  // every accented scout name into mojibake without it.
  return "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * Field ids worth exporting, in schema order — everything except media, whose
 * data URLs would each be megabytes of base64 in a spreadsheet cell. Those
 * ride in the photo archive instead.
 */
export function exportFieldIds(sections: readonly FormSection[]): string[] {
  const media = mediaFieldIds(sections);
  return sections.flatMap((section) =>
    section.fields.filter((f) => !media.has(f.id)).map((f) => f.id),
  );
}

function labelsFor(sections: readonly FormSection[], ids: readonly string[]) {
  const byId = new Map(
    sections.flatMap((s) => s.fields.map((f) => [f.id, `${s.title}: ${f.label}`])),
  );
  return ids.map((id) => byId.get(id) ?? id);
}

export function pitScoutCsv(
  sections: readonly FormSection[],
  entries: readonly PitEntry[],
): string {
  const ids = exportFieldIds(sections);
  const rows: unknown[][] = [["Team", "Scout", ...labelsFor(sections, ids)]];
  for (const entry of entries) {
    rows.push([entry.team, entry.scoutName, ...ids.map((id) => entry.values[id])]);
  }
  return toCsv(rows);
}

export function matchScoutCsv(
  sections: readonly FormSection[],
  entries: readonly MatchEntry[],
): string {
  const ids = exportFieldIds(sections);
  const rows: unknown[][] = [
    ["Match", "Team", "Alliance", "Scout", ...labelsFor(sections, ids)],
  ];
  for (const entry of entries) {
    rows.push([
      entry.matchNumber,
      entry.scoutedTeam,
      entry.alliance,
      entry.scoutName,
      ...ids.map((id) => entry.values[id]),
    ]);
  }
  return toCsv(rows);
}

/**
 * Strip anything awkward or unsafe inside an archive path. Separators go
 * first, then any run of dots, so no ".." survives to be walked back out of
 * the extraction directory by a careless unzip.
 */
export function safeFileName(value: string): string {
  return (
    value
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/\.{2,}/g, "_")
      .replace(/^[._-]+/, "") || "unnamed"
  );
}

/**
 * One archive entry per stored photo or drawing, named
 * `<team>/<field>.<ext>` so the folder view groups a robot's pictures
 * together. Fields that were never filled in are skipped rather than written
 * as empty files.
 */
export function photoEntries(
  sections: readonly FormSection[],
  media: readonly { team: string; values: FormValues }[],
): ZipEntry[] {
  const ids = mediaFieldIds(sections);
  const entries: ZipEntry[] = [];
  for (const robot of media) {
    for (const [id, value] of Object.entries(robot.values)) {
      if (!ids.has(id)) continue;
      const decoded = dataUrlBytes(value);
      if (!decoded) continue;
      entries.push({
        name: `${safeFileName(robot.team)}/${safeFileName(id)}.${decoded.extension}`,
        bytes: decoded.bytes,
      });
    }
  }
  return entries;
}

/** `5806scout-pit-2026-08-18.csv` — sorts chronologically in a downloads folder. */
export function exportFileName(kind: string, extension: string, at: Date): string {
  const stamp = [
    at.getFullYear(),
    String(at.getMonth() + 1).padStart(2, "0"),
    String(at.getDate()).padStart(2, "0"),
  ].join("-");
  return `5806scout-${kind}-${stamp}.${extension}`;
}
