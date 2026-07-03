import type { FormSection } from "@/lib/formSchema";

// Edit this config each January when the new game is revealed — the form at
// /match-scout renders whatever is here. Field ids become keys in the stored
// submission, so the Data tab aggregates whatever counters exist here.
//
// The fields below are deliberately generic placeholders until the 2027 game
// drops: most FRC games score "game pieces into goals" in auto and teleop
// and end with some kind of climb/park, so this shape stays useful.
export const MATCH_SCOUT_SECTIONS: readonly FormSection[] = [
  {
    title: "Autonomous",
    fields: [
      {
        kind: "select",
        id: "autoMobility",
        label: "Left starting zone",
        options: ["Yes", "No"],
      },
      { kind: "counter", id: "autoScoredLow", label: "Scored — low" },
      { kind: "counter", id: "autoScoredHigh", label: "Scored — high" },
      { kind: "counter", id: "autoMissed", label: "Missed" },
    ],
  },
  {
    title: "Teleop",
    fields: [
      { kind: "counter", id: "teleopScoredLow", label: "Scored — low" },
      { kind: "counter", id: "teleopScoredHigh", label: "Scored — high" },
      { kind: "counter", id: "teleopMissed", label: "Missed" },
      { kind: "counter", id: "teleopDropped", label: "Dropped pieces" },
    ],
  },
  {
    title: "Endgame",
    fields: [
      {
        kind: "select",
        id: "endgame",
        label: "Endgame result",
        options: ["None", "Park", "Climb — low", "Climb — high", "Failed climb"],
      },
    ],
  },
  {
    title: "Fouls & Notes",
    fields: [
      { kind: "counter", id: "fouls", label: "Fouls" },
      { kind: "counter", id: "techFouls", label: "Tech fouls" },
      {
        kind: "select",
        id: "died",
        label: "Robot died / immobilized",
        options: ["No", "Briefly", "Most of match"],
      },
      {
        kind: "textarea",
        id: "notes",
        label: "Notes",
        placeholder: "Defense played, driver skill, anything unusual…",
      },
    ],
  },
];
