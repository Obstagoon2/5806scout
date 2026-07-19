import { describe, expect, it } from "vitest";
import {
  applyCustomization,
  CUSTOM_SECTION_TITLE,
  emptyCustomization,
  makeCustomFieldId,
  sanitizeScoutFormsConfig,
  type CustomField,
} from "./customForms";
import { emptyValues, missingRequiredFields, type FormSection } from "./formSchema";

const DEFAULTS: readonly FormSection[] = [
  {
    title: "Autonomous",
    fields: [
      { kind: "select", id: "autoMobility", label: "Left zone", options: ["Yes", "No"] },
      { kind: "counter", id: "autoScoredLow", label: "Scored — low" },
    ],
  },
  {
    title: "Endgame",
    fields: [
      { kind: "select", id: "endgame", label: "Endgame", options: ["None", "Park"] },
    ],
  },
];

function custom(overrides: Partial<CustomField>): CustomField {
  return {
    id: "custom_q",
    kind: "text",
    label: "Custom Q",
    section: CUSTOM_SECTION_TITLE,
    ...overrides,
  };
}

describe("applyCustomization", () => {
  it("returns defaults untouched with no customization", () => {
    expect(applyCustomization(DEFAULTS, undefined)).toEqual(DEFAULTS);
    expect(applyCustomization(DEFAULTS, emptyCustomization())).toEqual(DEFAULTS);
  });

  it("hides fields and drops sections left empty", () => {
    const result = applyCustomization(DEFAULTS, {
      hiddenFieldIds: ["endgame", "autoScoredLow"],
      removedFieldIds: [],
      customFields: [],
    });
    expect(result).toEqual([
      {
        title: "Autonomous",
        fields: [
          { kind: "select", id: "autoMobility", label: "Left zone", options: ["Yes", "No"] },
        ],
      },
    ]);
  });

  it("drops removed fields from the form just like hidden ones", () => {
    const result = applyCustomization(DEFAULTS, {
      hiddenFieldIds: ["autoScoredLow"],
      removedFieldIds: ["endgame"],
      customFields: [],
    });
    expect(result).toEqual([
      {
        title: "Autonomous",
        fields: [
          { kind: "select", id: "autoMobility", label: "Left zone", options: ["Yes", "No"] },
        ],
      },
    ]);
  });

  it("appends custom fields to an existing section by title", () => {
    const result = applyCustomization(DEFAULTS, {
      hiddenFieldIds: [],
      removedFieldIds: [],
      customFields: [custom({ id: "custom_climb", section: "Endgame", kind: "counter" })],
    });
    const endgame = result.find((s) => s.title === "Endgame");
    expect(endgame?.fields.map((f) => f.id)).toEqual(["endgame", "custom_climb"]);
  });

  it("collects unknown-section customs into a trailing section", () => {
    const result = applyCustomization(DEFAULTS, {
      hiddenFieldIds: [],
      removedFieldIds: [],
      customFields: [custom({ id: "custom_a" }), custom({ id: "custom_b" })],
    });
    const last = result[result.length - 1];
    expect(last.title).toBe(CUSTOM_SECTION_TITLE);
    expect(last.fields.map((f) => f.id)).toEqual(["custom_a", "custom_b"]);
  });

  it("keeps a section alive via customs even when all defaults are hidden", () => {
    const result = applyCustomization(DEFAULTS, {
      hiddenFieldIds: ["endgame"],
      removedFieldIds: [],
      customFields: [custom({ id: "custom_climb", section: "Endgame" })],
    });
    const endgame = result.find((s) => s.title === "Endgame");
    expect(endgame?.fields.map((f) => f.id)).toEqual(["custom_climb"]);
  });

  it("skips customs whose id collides with a default or earlier custom", () => {
    const result = applyCustomization(DEFAULTS, {
      hiddenFieldIds: [],
      removedFieldIds: [],
      customFields: [
        custom({ id: "endgame", label: "Impostor" }),
        custom({ id: "custom_a", label: "First" }),
        custom({ id: "custom_a", label: "Duplicate" }),
      ],
    });
    const last = result[result.length - 1];
    expect(last.fields).toHaveLength(1);
    expect(last.fields[0].label).toBe("First");
  });

  it("produces fields that work with emptyValues and required validation", () => {
    const sections = applyCustomization(DEFAULTS, {
      hiddenFieldIds: [],
      removedFieldIds: [],
      customFields: [
        custom({ id: "custom_req", required: true }),
        custom({ id: "custom_tally", kind: "counter" }),
      ],
    });
    const values = emptyValues(sections);
    expect(values.custom_req).toBeNull();
    expect(values.custom_tally).toBe(0);
    expect(missingRequiredFields(sections, values)).toContain("Custom Q");
  });
});

describe("sanitizeScoutFormsConfig", () => {
  it("returns empty customizations for garbage input", () => {
    for (const garbage of [undefined, null, 42, "nope", [], { pitScout: 7 }]) {
      const config = sanitizeScoutFormsConfig(garbage);
      expect(config.pitScout).toEqual(emptyCustomization());
      expect(config.matchScout).toEqual(emptyCustomization());
    }
  });

  it("keeps valid entries and drops malformed ones", () => {
    const config = sanitizeScoutFormsConfig({
      matchScout: {
        hiddenFieldIds: ["fouls", 99, null],
        customFields: [
          { id: "custom_ok", kind: "text", label: "Fine", section: "Teleop" },
          { id: "", kind: "text", label: "No id" },
          { id: "custom_nolabel", kind: "text", label: "  " },
          { id: "custom_badkind", kind: "slider", label: "Bad kind" },
          { id: "custom_noopts", kind: "select", label: "Choices?", options: [] },
        ],
      },
    });
    expect(config.matchScout.hiddenFieldIds).toEqual(["fouls"]);
    expect(config.matchScout.removedFieldIds).toEqual([]);
    expect(config.matchScout.customFields).toEqual([
      { id: "custom_ok", kind: "text", label: "Fine", section: "Teleop" },
    ]);
  });

  it("keeps string removedFieldIds and drops malformed ones", () => {
    const config = sanitizeScoutFormsConfig({
      matchScout: { removedFieldIds: ["endgame", 7, null] },
    });
    expect(config.matchScout.removedFieldIds).toEqual(["endgame"]);
  });

  it("defaults a missing section to the custom section title", () => {
    const config = sanitizeScoutFormsConfig({
      pitScout: {
        customFields: [{ id: "custom_q", kind: "counter", label: "Q" }],
      },
    });
    expect(config.pitScout.customFields[0].section).toBe(CUSTOM_SECTION_TITLE);
  });

  it("keeps options and required only when meaningful", () => {
    const config = sanitizeScoutFormsConfig({
      pitScout: {
        customFields: [
          {
            id: "custom_pick",
            kind: "select",
            label: "Pick",
            section: "Robot Basics",
            options: ["A", "", "B", 3],
            required: true,
          },
        ],
      },
    });
    expect(config.pitScout.customFields[0]).toEqual({
      id: "custom_pick",
      kind: "select",
      label: "Pick",
      section: "Robot Basics",
      options: ["A", "B"],
      required: true,
    });
  });
});

describe("makeCustomFieldId", () => {
  it("slugifies the label with a custom_ prefix", () => {
    expect(makeCustomFieldId("Can they climb?", new Set())).toBe(
      "custom_can_they_climb",
    );
  });

  it("falls back for empty labels and dedupes taken ids", () => {
    expect(makeCustomFieldId("!!!", new Set())).toBe("custom_question");
    const taken = new Set(["custom_q", "custom_q_2"]);
    expect(makeCustomFieldId("Q", taken)).toBe("custom_q_3");
  });
});
