import { describe, expect, it } from "vitest";
import {
  emptyValues,
  missingRequiredFields,
  type FormSection,
} from "./formSchema";

const sections: readonly FormSection[] = [
  {
    title: "Test",
    fields: [
      { kind: "select", id: "drive", label: "Drive", options: ["A"], required: true },
      { kind: "number", id: "weight", label: "Weight" },
      { kind: "multiselect", id: "mechs", label: "Mechs", options: ["X", "Y"] },
      { kind: "counter", id: "scored", label: "Scored" },
    ],
  },
];

describe("emptyValues", () => {
  it("initializes multiselects to [], counters to 0, everything else to null", () => {
    expect(emptyValues(sections)).toEqual({
      drive: null,
      weight: null,
      mechs: [],
      scored: 0,
    });
  });
});

describe("missingRequiredFields", () => {
  it("lists required fields that are empty", () => {
    expect(missingRequiredFields(sections, emptyValues(sections))).toEqual([
      "Drive",
    ]);
  });

  it("returns empty when required fields are filled", () => {
    const values = { ...emptyValues(sections), drive: "A" };
    expect(missingRequiredFields(sections, values)).toEqual([]);
  });

  it("ignores optional fields", () => {
    const values = { ...emptyValues(sections), drive: "A", weight: null };
    expect(missingRequiredFields(sections, values)).toEqual([]);
  });
});
