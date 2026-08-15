import { describe, expect, it } from "vitest";
import { mediaFieldIds, splitMediaValues } from "./formMedia";
import type { FormSection } from "./formSchema";

const SECTIONS: readonly FormSection[] = [
  {
    title: "Robot Basics",
    fields: [
      { kind: "select", id: "drivetrain", label: "Drivetrain", options: ["Swerve"] },
      { kind: "photo", id: "robotPhoto", label: "Robot photo" },
    ],
  },
  {
    title: "Autonomous",
    fields: [
      { kind: "textarea", id: "autoRoutines", label: "Routines" },
      { kind: "drawing", id: "autoPathMap", label: "Auto path map" },
    ],
  },
];

describe("mediaFieldIds", () => {
  it("finds drawing and photo fields across sections", () => {
    expect([...mediaFieldIds(SECTIONS)].sort()).toEqual([
      "autoPathMap",
      "robotPhoto",
    ]);
  });

  it("is empty for a schema with no media fields", () => {
    const plain: readonly FormSection[] = [
      { title: "Notes", fields: [{ kind: "text", id: "notes", label: "Notes" }] },
    ];
    expect(mediaFieldIds(plain).size).toBe(0);
  });
});

describe("splitMediaValues", () => {
  it("routes data-URL answers to media and the rest to core", () => {
    const { core, media } = splitMediaValues(SECTIONS, {
      drivetrain: "Swerve",
      robotPhoto: "data:image/jpeg;base64,AAA",
      autoRoutines: "Two-piece",
      autoPathMap: "data:image/png;base64,BBB",
    });
    expect(core).toEqual({ drivetrain: "Swerve", autoRoutines: "Two-piece" });
    expect(media).toEqual({
      robotPhoto: "data:image/jpeg;base64,AAA",
      autoPathMap: "data:image/png;base64,BBB",
    });
  });

  it("keeps media keys out of core even when unanswered", () => {
    const { core, media } = splitMediaValues(SECTIONS, {
      drivetrain: null,
      robotPhoto: null,
      autoPathMap: null,
      autoRoutines: null,
    });
    // A cleared photo must still travel as media — writing null into the main
    // doc instead would leave a stale image in the sibling doc.
    expect(Object.keys(core).sort()).toEqual(["autoRoutines", "drivetrain"]);
    expect(Object.keys(media).sort()).toEqual(["autoPathMap", "robotPhoto"]);
  });

  it("passes through values for fields the schema no longer has", () => {
    const { core, media } = splitMediaValues(SECTIONS, { retired: 3 });
    expect(core).toEqual({ retired: 3 });
    expect(media).toEqual({});
  });
});
