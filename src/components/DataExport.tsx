"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import {
  exportFileName,
  matchScoutCsv,
  photoEntries,
  pitScoutCsv,
  type MatchEntry,
  type PitEntry,
} from "@/lib/exportData";
import { db } from "@/lib/firebase/client";
import type { FormValues } from "@/lib/formSchema";
import { PIT_MEDIA_COLLECTION } from "@/lib/pitScoutSchema";
import { useScoutForms } from "@/lib/useScoutForms";
import { zipEntries } from "@/lib/zip";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { useState } from "react";

// Season data, out of Firestore and onto a laptop — for a lead who wants to
// slice it in a spreadsheet, and so a season's scouting outlives this app.
//
// The reads are one-shot getDocs rather than listeners: an export is a
// deliberate act, and photos in particular are far too heavy to stream into
// a page that merely has the Team tab open.

const KINDS = ["pit", "match", "photos"] as const;
type Kind = (typeof KINDS)[number];

const LABELS: Record<Kind, string> = {
  pit: "Pit scouting",
  match: "Match scouting",
  photos: "Robot pictures",
};

const DESCRIPTIONS: Record<Kind, string> = {
  pit: "One row per robot, as a CSV.",
  match: "One row per scouted match, as a CSV.",
  photos: "Every photo and drawing, as a ZIP of folders by team.",
};

type Status =
  | { state: "idle" }
  | { state: "working"; note: string }
  | { state: "done"; note: string }
  | { state: "error"; message: string };

function download(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoked on the next tick — revoking synchronously can beat the browser
  // to the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DataExport() {
  const { dataTeamId } = useAuth();
  const { pitSections, matchSections } = useScoutForms();
  const [chosen, setChosen] = useState<Set<Kind>>(() => new Set(KINDS));
  const [status, setStatus] = useState<Status>({ state: "idle" });

  function toggle(kind: Kind) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }

  async function run() {
    if (!dataTeamId || chosen.size === 0) return;
    const teamId = dataTeamId;
    const at = new Date();
    const produced: string[] = [];

    try {
      if (chosen.has("pit")) {
        setStatus({ state: "working", note: "Reading pit scouting…" });
        const snapshot = await getDocs(
          collection(db, "teams", teamId, "pitScouting"),
        );
        const entries: PitEntry[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            team: d.id,
            scoutName: (data.scoutName as string) ?? "",
            values: (data.values as FormValues) ?? {},
          };
        });
        entries.sort((a, b) => a.team.localeCompare(b.team, undefined, { numeric: true }));
        download(
          exportFileName("pit", "csv", at),
          new Blob([pitScoutCsv(pitSections, entries)], {
            type: "text/csv;charset=utf-8",
          }),
        );
        produced.push(`${entries.length} robots`);
      }

      if (chosen.has("match")) {
        setStatus({ state: "working", note: "Reading match scouting…" });
        const snapshot = await getDocs(
          query(
            collection(db, "teams", teamId, "matchScouting"),
            orderBy("matchNumber", "asc"),
          ),
        );
        const entries: MatchEntry[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            matchNumber: (data.matchNumber as number) ?? 0,
            scoutedTeam: (data.scoutedTeam as string) ?? "",
            alliance: (data.alliance as string) ?? "",
            scoutName: (data.scoutName as string) ?? "",
            values: (data.values as FormValues) ?? {},
          };
        });
        download(
          exportFileName("match", "csv", at),
          new Blob([matchScoutCsv(matchSections, entries)], {
            type: "text/csv;charset=utf-8",
          }),
        );
        produced.push(`${entries.length} submissions`);
      }

      if (chosen.has("photos")) {
        setStatus({ state: "working", note: "Reading robot pictures…" });
        const snapshot = await getDocs(
          collection(db, "teams", teamId, PIT_MEDIA_COLLECTION),
        );
        const media = snapshot.docs.map((d) => ({
          team: d.id,
          values: (d.data().values as FormValues) ?? {},
        }));
        const files = photoEntries(pitSections, media);
        if (files.length === 0) {
          produced.push("no pictures yet");
        } else {
          setStatus({ state: "working", note: `Packing ${files.length} pictures…` });
          download(
            exportFileName("pictures", "zip", at),
            // .slice() hands Blob a plain ArrayBuffer-backed view; the bare
            // Uint8Array type admits SharedArrayBuffer, which BlobPart rejects.
            new Blob([zipEntries(files, at).slice().buffer], {
              type: "application/zip",
            }),
          );
          produced.push(`${files.length} pictures`);
        }
      }

      setStatus({ state: "done", note: produced.join(" · ") });
    } catch {
      setStatus({
        state: "error",
        message:
          "Couldn't finish the export — check your connection and try again.",
      });
    }
  }

  const working = status.state === "working";

  return (
    <div className="surface-card flex flex-col gap-3 p-4">
      <div>
        <h2 className="section-title">Export data</h2>
        <p className="mt-1 text-sm text-graphite-500">
          Pick what to download. CSVs open in any spreadsheet; pictures come as
          a ZIP.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={working}>
        <legend className="sr-only">What to export</legend>
        {KINDS.map((kind) => (
          <label
            key={kind}
            className="flex cursor-pointer items-start gap-2.5 rounded-md border border-graphite-200 px-3 py-2.5"
          >
            <input
              type="checkbox"
              checked={chosen.has(kind)}
              onChange={() => toggle(kind)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-maroon-600"
            />
            <span>
              <span className="block text-sm font-medium text-graphite-900">
                {LABELS[kind]}
              </span>
              <span className="block text-xs text-graphite-500">
                {DESCRIPTIONS[kind]}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={working || chosen.size === 0}
          className="btn-primary"
        >
          {working
            ? "Exporting…"
            : chosen.size === KINDS.length
              ? "Export everything"
              : `Export ${chosen.size} of ${KINDS.length}`}
        </button>
        <button
          type="button"
          onClick={() => setChosen(new Set(KINDS))}
          disabled={working || chosen.size === KINDS.length}
          className="btn-secondary"
        >
          Select all
        </button>
      </div>

      {status.state === "working" && (
        <p className="text-sm text-graphite-500">{status.note}</p>
      )}
      {status.state === "done" && (
        <p className="text-sm text-graphite-600">Exported {status.note}.</p>
      )}
      {status.state === "error" && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {status.message}
        </p>
      )}
      {chosen.size === 0 && (
        <p className="text-xs text-graphite-500">Pick at least one to export.</p>
      )}
    </div>
  );
}
