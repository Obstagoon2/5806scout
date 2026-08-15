import type { FormSection } from "@/lib/formSchema";

// Edit this config (not the form component) when the game changes what's
// worth asking in the pit. The form at /pit-scout renders whatever is here.

/** Sibling collection holding each robot's photo/drawing answers — see
 *  src/lib/formMedia.ts for why they don't live in the submission doc. */
export const PIT_MEDIA_COLLECTION = "pitScoutingMedia";

const YES_NO = ["Yes", "No"] as const;

const SPEED_RANKS = [
  "Super fast",
  "Fast",
  "Average",
  "Slow",
  "Very slow",
] as const;
export const PIT_SCOUT_SECTIONS: readonly FormSection[] = [
  {
    title: "Robot Basics",
    fields: [
      {
        kind: "select",
        id: "drivetrain",
        label: "Drivetrain",
        options: ["Swerve", "Tank", "Mecanum", "Other"],
        required: true,
      },
      { kind: "number", id: "weightLbs", label: "Weight", unit: "lbs", min: 0, max: 155 },
      { kind: "number", id: "lengthIn", label: "Length", unit: "in", min: 0 },
      { kind: "number", id: "widthIn", label: "Width", unit: "in", min: 0 },
      { kind: "number", id: "heightIn", label: "Height", unit: "in", min: 0 },
      {
        kind: "photo",
        id: "robotPhoto",
        label: "Robot photo",
        hint: "Shoot the whole robot from the side — it's how the drive team recognizes them at the field.",
      },
    ],
  },
  {
    title: "Autonomous",
    fields: [
      {
        kind: "textarea",
        id: "autoRoutines",
        label: "Auto capabilities / routines",
        placeholder: "What can they do in auto? Starting positions, scoring, mobility…",
      },
      {
        kind: "drawing",
        id: "autoPathMap",
        label: "Auto path map",
        hint: "Sketch their starting spot and the path they run. Red zone is left, blue is right.",
      },
    ],
  },
  {
    title: "Capabilities",
    fields: [
      {
        kind: "multiselect",
        id: "mechanisms",
        label: "Mechanisms",
        // Placeholder list — update when the 2027 game is revealed.
        options: [
          "Intake (ground)",
          "Intake (station)",
          "Elevator / lift",
          "Arm",
          "Climber",
          "Vision / auto-align",
        ],
      },
    ],
  },
  {
    title: "Before talking to anyone:",
    fields: [
      { kind: "select", id: "isKitBot", label: "Is it a KitBot?", options: YES_NO },
      {
        kind: "select",
        id: "looksDurable",
        label: "Does the robot look durable?",
        options: YES_NO,
      },
      {
        kind: "text",
        id: "repairingWhat",
        label:
          "Is the team working on repairing / attaching something? If so, what is that piece?",
      },
      {
        kind: "text",
        id: "pitAdvancedMachinery",
        label: "What is the most advanced piece of machinery in their pit?",
      },
    ],
  },
  {
    title: "Questions to ask a team rep:",
    description: "Please make sure they answer ALL parts of these questions",
    fields: [
      { kind: "text", id: "repDrivetrain", label: "What is your drivetrain?" },
      { kind: "text", id: "repMaxCapacity", label: "What is your max capacity?" },
      {
        kind: "text",
        id: "repCycleSpeed",
        label: "How fast is your cycle? (it's ok if they don't know)",
      },
      { kind: "text", id: "repBps", label: "What is your BPS (balls per second)?" },
      {
        kind: "select",
        id: "repIntakeSpeed",
        label: "Rank your intake speed",
        options: SPEED_RANKS,
      },
      {
        kind: "select",
        id: "repIndexerSpeed",
        label: "Rank your indexer speed",
        options: SPEED_RANKS,
      },
      {
        kind: "select",
        id: "repShooterSpeed",
        label: "Rank your shooter speed",
        options: SPEED_RANKS,
      },
      {
        kind: "text",
        id: "repJams",
        label:
          "Have you had ANY jams? If so, where? (including getting stuck on ramp or trench)",
      },
      {
        kind: "select",
        id: "repDefenseComfort",
        label: "Does your driver feel comfortable playing defense?",
        options: YES_NO,
      },
      {
        kind: "textarea",
        id: "repAutonPath",
        label:
          "What is your auton path, and about how many balls do you score?",
      },
      {
        kind: "text",
        id: "repTurretOrFixed",
        label:
          "Do you have a turret or a fixed shooter? (if fixed, how many shooters at once?)",
      },
      {
        kind: "select",
        id: "repAiming",
        label:
          "Do you use code-assisted (AprilTag alignment) or driver-based (no AprilTag alignment) aiming?",
        options: ["Code-assisted (AprilTag)", "Driver-based (no AprilTag)"],
      },
      {
        kind: "select",
        id: "repIdealRole",
        label:
          "What is your team's ideal role / specialization? (shooter, passer, defensive bot)",
        options: ["Shooter", "Passer", "Defensive bot"],
      },
      {
        kind: "text",
        id: "repAdvancedMachinery",
        label:
          "What is the most advanced piece of machinery you used this season?",
      },
      {
        kind: "textarea",
        id: "repProblems",
        label:
          "What problems have you encountered with either hardware or software? Please be specific.",
      },
      {
        kind: "textarea",
        id: "repStandoutFeatures",
        label: "What features set your robot apart?",
      },
      {
        kind: "textarea",
        id: "repStartOver",
        label:
          "Last question: if you could start over and change one thing about your robot, what would it be and why?",
      },
    ],
  },
  {
    title: "Notes",
    fields: [
      {
        kind: "textarea",
        id: "notes",
        label: "Notes",
        placeholder: "Anything else worth knowing — driver skill, reliability, cycle speed…",
      },
    ],
  },
];
