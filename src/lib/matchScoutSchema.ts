import type { FormSection } from "@/lib/formSchema";

// REBUILT (2026): robots collect FUEL and shoot it into their alliance HUB
// (1 point per fuel in auto and teleop alike), then climb the TOWER — Level 1
// is worth 15 in auto, and Levels 1/2/3 are worth 10/20/30 in endgame. Fuel
// volume is enormous (hundreds of balls a match), so scouts count it with
// quick-increment buttons, not +1 taps.
//
// This schema is the data dictionary for match submissions. The Match Scout
// page renders a bespoke REBUILT UI (not a schema-driven form), but writes
// `values` keyed by these ids — and the Data, Drive, Teams, and Picklist
// pages all derive their columns and labels from what's listed here. Keep
// the ids in sync with match-scout/page.tsx and the weights in drive.ts.
//
// Teams may strike, delete, or add questions on top of this from Form Setup
// (see customForms.ts); the bespoke page skips the blocks whose field the
// team dropped and renders team-added questions generically.
//
// Naming constraints downstream code relies on:
// - Picklist sums counters whose ids start with "autoScored" / "teleopScored".
// - Data + Picklist show the mode of the select with id "endgame".
export const MATCH_SCOUT_SECTIONS: readonly FormSection[] = [
  {
    title: "Pre-Match",
    fields: [
      {
        kind: "select",
        id: "startPos",
        label: "Starting position",
        // Paired depot/outpost so the picker lays out as two mirrored
        // columns; Center is the odd one out and sits last.
        options: [
          "Depot side",
          "Outpost side",
          "Depot side bump",
          "Outpost side bump",
          "Depot side trench",
          "Outpost side trench",
          "Center (Hub)",
        ],
      },
      {
        kind: "select",
        id: "noShow",
        label: "No show",
        options: ["No", "Yes"],
      },
    ],
  },
  {
    title: "Autonomous",
    fields: [
      {
        kind: "select",
        id: "autoLeave",
        label: "Left starting zone",
        options: ["Yes", "No"],
      },
      { kind: "counter", id: "autoScoredFuel", label: "Fuel scored" },
      {
        kind: "multiselect",
        id: "autoFuelSource",
        label: "Collected fuel from",
        options: ["Preload", "Depot", "Outpost", "Neutral zone"],
      },
      {
        kind: "select",
        id: "autoClimb",
        label: "Auto climb — Level 1",
        options: ["No attempt", "Climbed (L1)", "Failed"],
      },
      {
        kind: "drawing",
        id: "autoPath",
        label: "Auto path",
        hint: "Trace the route the robot drove during auto.",
      },
    ],
  },
  {
    title: "Teleop",
    fields: [
      { kind: "counter", id: "teleopScoredFuel", label: "Fuel scored" },
      { kind: "counter", id: "teleopFuelFed", label: "Fuel fed / passed" },
      {
        kind: "multiselect",
        id: "teleopFuelSource",
        label: "Collected fuel from",
        options: ["Depot", "Outpost", "Neutral zone", "Opposing zone"],
      },
      {
        kind: "multiselect",
        id: "crossings",
        label: "Crossed during match",
        options: ["Bump", "Trench"],
      },
      // Defense is timed, not eyeballed — the Match Scout page runs a
      // stopwatch off the match clock and writes whole seconds here. They're
      // counters so the Data tab averages them per team, and drive.ts weights
      // them at 0 so seconds never read as points.
      { kind: "counter", id: "defenseSeconds", label: "Defense played (sec)" },
      {
        kind: "counter",
        id: "defendedSeconds",
        label: "Defended against (sec)",
      },
    ],
  },
  {
    title: "Endgame",
    fields: [
      {
        kind: "select",
        id: "endgame",
        label: "Tower climb",
        options: ["None", "Level 1", "Level 2", "Level 3", "Failed attempt"],
      },
    ],
  },
  {
    title: "Post-Match",
    fields: [
      // Ratings ride as counters so the Data tab averages them per team; the
      // Match Scout page renders them as 0–5 scales, and drive.ts weights
      // them at 0 points so they never leak into score predictions.
      // Shooter rate, set on a 1–25 slider rather than tallied. It's an
      // observation about the robot, not an event count, so like the ratings
      // it carries no point weight.
      { kind: "counter", id: "fuelRate", label: "Fuel rate (balls/sec)", max: 25 },
      { kind: "counter", id: "driverSkill", label: "Driver skill (0–5)", max: 5 },
      { kind: "counter", id: "defenseSkill", label: "Defense skill (0–5)", max: 5 },
      {
        kind: "select",
        id: "died",
        label: "Died / immobilized",
        options: ["No", "Briefly", "Most of match"],
      },
      {
        kind: "select",
        id: "tipped",
        label: "Tipped / fell over",
        options: ["No", "Yes"],
      },
      {
        kind: "select",
        id: "card",
        label: "Card",
        options: ["None", "Yellow", "Red"],
      },
      {
        kind: "select",
        id: "wouldPick",
        label: "Would you pick them?",
        options: ["Yes", "Maybe", "No"],
      },
      {
        kind: "textarea",
        id: "notes",
        label: "Notes",
        placeholder: "Shooting range, cycle speed, driver skill, anything unusual…",
      },
    ],
  },
];

/** Season field id → its label, for warnings that name a dropped question. */
export const MATCH_FIELD_LABELS: Readonly<Record<string, string>> =
  Object.fromEntries(
    MATCH_SCOUT_SECTIONS.flatMap((section) =>
      section.fields.map((field) => [field.id, field.label] as const),
    ),
  );
