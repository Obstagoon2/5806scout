import {
  csvCell,
  exportFieldIds,
  exportFileName,
  matchScoutCsv,
  photoEntries,
  pitScoutCsv,
  safeFileName,
  toCsv,
} from "@/lib/exportData";
import type { FormSection } from "@/lib/formSchema";
import { describe, expect, it } from "vitest";

const SECTIONS: FormSection[] = [
  {
    title: "Robot",
    fields: [
      { kind: "counter", id: "weight", label: "Weight" },
      { kind: "select", id: "drivetrain", label: "Drivetrain", options: ["Swerve", "Tank"] },
      { kind: "multiselect", id: "can", label: "Can do", options: ["Climb", "Score"] },
      { kind: "textarea", id: "notes", label: "Notes" },
      { kind: "photo", id: "robotPhoto", label: "Robot photo" },
      { kind: "drawing", id: "autoPath", label: "Auto path" },
    ],
  },
];

// A 1x1 GIF, the smallest thing that survives a real base64 round trip.
const GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

describe("csvCell", () => {
  it("leaves a plain value unquoted", () => {
    expect(csvCell("Swerve")).toBe("Swerve");
    expect(csvCell(12)).toBe("12");
  });

  it("quotes and escapes anything that would break the row", () => {
    // A scout's note with a comma used to shift every later column.
    expect(csvCell("fast, but tippy")).toBe('"fast, but tippy"');
    expect(csvCell('says "good"')).toBe('"says ""good"""');
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
  });

  it("renders empties, arrays and booleans readably", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(["Climb", "Score"])).toBe("Climb; Score");
    expect(csvCell(true)).toBe("Yes");
    expect(csvCell(false)).toBe("No");
  });
});

describe("toCsv", () => {
  it("joins rows with CRLF behind a BOM so Excel reads UTF-8", () => {
    const csv = toCsv([["a", "b"], [1, 2]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("a,b\r\n1,2");
  });
});

describe("exportFieldIds", () => {
  it("keeps every scalar field and drops media", () => {
    // Photos are megabytes of base64 — they belong in the archive, not a cell.
    expect(exportFieldIds(SECTIONS)).toEqual([
      "weight",
      "drivetrain",
      "can",
      "notes",
    ]);
  });
});

describe("pitScoutCsv", () => {
  it("writes a header with section-qualified labels and one row per robot", () => {
    const csv = pitScoutCsv(SECTIONS, [
      {
        team: "5806",
        scoutName: "Ana",
        values: { weight: 120, drivetrain: "Swerve", can: ["Climb"], notes: "solid" },
      },
    ]);
    const [header, row] = csv.slice(1).split("\r\n");
    expect(header).toBe(
      "Team,Scout,Robot: Weight,Robot: Drivetrain,Robot: Can do,Robot: Notes",
    );
    expect(row).toBe("5806,Ana,120,Swerve,Climb,solid");
  });

  it("leaves unanswered fields empty rather than dropping the column", () => {
    const csv = pitScoutCsv(SECTIONS, [
      { team: "254", scoutName: "Raj", values: { weight: 100 } },
    ]);
    expect(csv.slice(1).split("\r\n")[1]).toBe("254,Raj,100,,,");
  });
});

describe("matchScoutCsv", () => {
  it("leads with the match identifiers", () => {
    const csv = matchScoutCsv(SECTIONS, [
      {
        matchNumber: 12,
        scoutedTeam: "1114",
        alliance: "red",
        scoutName: "Ana",
        values: { weight: 3 },
      },
    ]);
    const [header, row] = csv.slice(1).split("\r\n");
    expect(header.startsWith("Match,Team,Alliance,Scout,")).toBe(true);
    expect(row.startsWith("12,1114,red,Ana,3")).toBe(true);
  });
});

describe("safeFileName", () => {
  it("strips path separators and traversal", () => {
    // These become paths inside the archive, so no ".." may survive.
    expect(safeFileName("../../etc/passwd")).toBe("etc_passwd");
    expect(safeFileName("a/b/../c")).not.toContain("..");
    expect(safeFileName("team 5806")).toBe("team_5806");
  });

  it("never returns an empty name", () => {
    expect(safeFileName("")).toBe("unnamed");
    expect(safeFileName("...")).toBe("unnamed");
  });
});

describe("photoEntries", () => {
  it("names each picture by robot and field", () => {
    const entries = photoEntries(SECTIONS, [
      { team: "5806", values: { robotPhoto: GIF, autoPath: GIF } },
    ]);
    expect(entries.map((e) => e.name).sort()).toEqual([
      "5806/autoPath.gif",
      "5806/robotPhoto.gif",
    ]);
    expect(entries[0].bytes.length).toBeGreaterThan(0);
  });

  it("skips unfilled fields and non-media answers", () => {
    const entries = photoEntries(SECTIONS, [
      { team: "5806", values: { robotPhoto: null, notes: "not a photo", weight: 4 } },
    ]);
    expect(entries).toEqual([]);
  });

  it("keeps robots apart even when the field ids match", () => {
    const entries = photoEntries(SECTIONS, [
      { team: "5806", values: { robotPhoto: GIF } },
      { team: "254", values: { robotPhoto: GIF } },
    ]);
    expect(entries.map((e) => e.name)).toEqual([
      "5806/robotPhoto.gif",
      "254/robotPhoto.gif",
    ]);
  });
});

describe("exportFileName", () => {
  it("stamps the date so downloads sort chronologically", () => {
    expect(exportFileName("pit", "csv", new Date(2026, 7, 18))).toBe(
      "5806scout-pit-2026-08-18.csv",
    );
  });
});
