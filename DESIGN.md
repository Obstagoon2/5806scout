---
name: FRC 5806 Scouting
description: A field-ops console for pit and match scouting, built for the stands and the strategy room alike.
colors:
  maroon-50: "#fbeced"
  maroon-100: "#f5d0d3"
  maroon-200: "#e8a2a8"
  maroon-300: "#d8737d"
  maroon-400: "#c04a56"
  maroon-500: "#8f1f2b"
  maroon-600: "#7a1a24"
  maroon-700: "#5e141c"
  maroon-800: "#451015"
  maroon-900: "#2e0a0e"
  graphite-50: "#f7f7f8"
  graphite-100: "#eceded"
  graphite-200: "#d5d7d9"
  graphite-300: "#b3b7bb"
  graphite-400: "#888e94"
  graphite-500: "#5f6569"
  graphite-600: "#454a4e"
  graphite-700: "#33373a"
  graphite-800: "#232629"
  graphite-900: "#17181a"
  amber-100: "#fdecd2"
  amber-500: "#d97706"
  green-100: "#d9f0e1"
  green-500: "#15803d"
  neutral-bg: "#faf7f5"
  neutral-ink: "#201a1b"
typography:
  display:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.08em"
  body:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, Arial, Helvetica, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
  stat:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.maroon-600}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
  button-primary-hover:
    backgroundColor: "{colors.maroon-700}"
  button-secondary:
    backgroundColor: "#ffffff"
    textColor: "{colors.graphite-700}"
    rounded: "{rounded.sm}"
    padding: "10px 16px"
  input-field:
    backgroundColor: "#ffffff"
    textColor: "{colors.graphite-900}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
---

# Design System: FRC 5806 Scouting

## 1. Overview

**Creative North Star: "The Lion's Den"**

This is a field-ops console, not a dashboard demo — built to be thumbed through in a loud, bright convention-center pit and reviewed carefully on a laptop the night before eliminations. The system is deliberately unglamorous where glamour would slow someone down: flat surfaces, hard borders, no shadows to squint through, numbers set in monospace so a column of match scores reads like telemetry instead of prose. Maroon and white — Team 5806's colors — carry the team's identity and confidence, appearing at full saturation only where it means something (a primary action, an active tab, the header) rather than washing across every surface. The lion shows up as attitude, not as illustration: sharp corners are avoided in favor of small, consistent radii; the tone is direct and declarative rather than playful.

What this explicitly rejects: the generic consumer-SaaS look — soft gradients, cute illustrations, cream/pastel backgrounds, "delightful onboarding" energy. This is the tool a pit crew reaches for mid-event, not a trial-signup flow.

**Key Characteristics:**
- Flat, bordered surfaces — no drop shadows anywhere in the system
- Maroon reserved for action and emphasis; graphite carries the everyday chrome
- Numeric data (scores, ranks, EPA, match numbers) always renders in monospace
- Small, consistent corner radii (6–8px) — nothing sharp, nothing soft-rounded
- Contrast pushed generously above AA-minimum for high-glare outdoor/convention-hall readability

## 2. Colors

A two-color system — confident team maroon plus a neutral graphite chrome — with a small set of functional accents that exist only to carry status, never decoration.

### Primary
- **Confident Team Maroon** (`#7a1a24`, maroon-600): the identity color. Used for primary buttons, active nav/tab states, links, and required-field markers. Deliberately kept off backgrounds — its job is to draw the eye to the one action that matters on a screen, not to fill space.

### Neutral
- **Graphite** (`#33373a`–`#5f6569`, graphite-600/500): body text, secondary labels, borders, inactive nav.
- **Ink** (`#201a1b`): body copy on the page background; near-black rather than a softened gray, so text stays legible in bright light.
- **Warm White** (`#faf7f5`): page background — a true near-white with a faint warm tint from the team palette, not the "sand/cream" AI default; surfaces (cards, headers, inputs) sit on pure white (`#ffffff`) above it for contrast.
- **Graphite 200** (`#d5d7d9`): the default border color for cards, inputs, and dividers throughout the system.

### Functional accents
- **Amber** (`#d97706` on `#fdecd2`): pending / warning states (e.g. an assignment awaiting action).
- **Green** (`#15803d` on `#d9f0e1`): success / done states (e.g. "Submitted", "Done").
- **Sky blue** (`sky-700`): the Blue Alliance toggle in match scouting — the one deliberate exception to the maroon/graphite system, because it has to read unambiguously as "the other team's color," not as a brand accent.
- **Hard red flash** (`#dc2626` / white, step-start `queue-blink`): the "queuing soon" alert on the Pit Dashboard — a hard on/off flash with no fade, built to read from across a noisy pit, distinct from maroon so it never gets mistaken for a routine action color.

### Named Rules
**The Reserved Maroon Rule.** Maroon is for things the user should *do* or that are *currently active* — a primary button, an active tab, a required marker. It never fills a background or a card. If maroon is covering more than a button or a thin active-state border, it's being used wrong.

## 3. Typography

**Body Font:** Geist (with Arial, Helvetica, sans-serif fallback)
**Stat/Label Font:** Geist Mono (with monospace fallback)

**Character:** One sans family carries all prose and UI chrome — no display serif, no second brand font. The mono face is the signature move: it's reserved for numbers that need to line up and be scanned at speed, so switching typefaces itself signals "this is data, read it like data."

### Hierarchy
- **Display** (600 weight, 1.5rem/24px, 1.25 line-height): page-level headings (e.g. "Welcome to this scouting website").
- **Title** (600 weight, 0.75rem/12px, uppercase, 0.08em tracking): section labels ("Jump in", form section legends) — small and wide-tracked so it reads as structure, not content.
- **Body** (400 weight, 0.875rem/14px, 1.5 line-height): all prose, form labels, descriptions.
- **Label** (500 weight, 0.75rem/12px): field labels, badges, nav item text.
- **Stat** (400 weight, 0.875rem/14px, Geist Mono): match numbers, team numbers, scores, EPA, ranks, timestamps — anything numeric a scout or admin needs to scan down a column.

### Named Rules
**The Telemetry Rule.** Any number that represents scouting data (a score, a rank, a team ID, an EPA figure) renders in Geist Mono via the `font-stat` token. Prose and UI labels never do. This is the single most memorable visual signal in the system — protect it.

## 4. Elevation

Flat by default, everywhere. There is no shadow vocabulary in this system — depth and grouping are conveyed entirely through borders (`graphite-200`, 1px) and background contrast (white surfaces on the warm-white page background), not through blur or lift. This is a deliberate choice for a tool used outdoors in bright light, where soft shadows disappear against glare and add nothing but noise.

### Named Rules
**The Flat-By-Default Rule.** No `box-shadow` anywhere in the system. Depth comes from a 1px `graphite-200` border and a white-on-warm-white contrast step. If a component feels like it needs a shadow to separate from its background, give it a border instead.

## 5. Components

Blunt and tactile where the interaction is the point (buttons, toggles), crisp and restrained everywhere else (cards, inputs, nav) — decisive to press, quiet to read.

### Buttons
- **Shape:** small radius (6px, `rounded-md` in the codebase's Tailwind scale).
- **Primary:** `maroon-600` background, white text, 600-weight label, `12px 16px` padding. Hover deepens to `maroon-700`. Disabled drops to 60% opacity — no color change, so it never gets mistaken for an error state.
- **Secondary / Toggle (unselected):** white background, `graphite-200` border, `graphite-700` text; hover darkens the border to `graphite-300`. Selected/active toggle state (e.g. the Red/Blue alliance picker) fills solid with its color and flips text to white — the same treatment as a primary button, so "selected" always reads as unambiguously as "primary action."

### Cards / Containers
- **Corner Style:** 8px radius (`rounded-lg`) for page-level containers and list wrappers; 6px (`rounded-md`) for tighter in-form elements.
- **Background:** white on the warm-white (`#faf7f5`) page background.
- **Shadow Strategy:** none — see Elevation.
- **Border:** 1px `graphite-200` always; this is the only depth cue.
- **Internal Padding:** generous — `px-6 py-10` for hero/welcome blocks, `px-4 py-3` for list rows.

### Inputs / Fields
- **Style:** white background, 1px `graphite-200` border, 6px radius, `10px 12px` padding, 14px body text.
- **Focus:** border shifts to `maroon-400` with a `maroon-100` focus ring (`ring-2`) — no glow, no shadow, just a clear color-and-ring state change that's visible in bright light.
- **Numeric inputs:** always paired with the Stat font (`font-stat`) per the Telemetry Rule.
- **Counters (numeric step inputs):** rendered as a bordered group with visible +/− controls rather than a bare number field — built for fast, accurate taps under time pressure, not typing.

### Navigation
- **Desktop:** a horizontal tab bar, white background, 1px `graphite-200` bottom border. Active tab gets a 2px `maroon-600` underline and `maroon-700` text; inactive tabs are `graphite-500`, hover darkens to `graphite-900`.
- **Mobile:** a fixed bottom tab bar (white, top-bordered) with icon-less text labels and a small maroon dot indicator above the active item — kept thumb-reachable and legible one-handed.
- **Header:** the one place maroon fills a background (`maroon-700`) rather than acting as an accent — it's the app's identity band, always visible, carrying the team number and an Admin badge when relevant.

### Alerts (status)
- **Success:** `green-100` background, `green-500` text, `rounded-md`, no border.
- **Error:** `maroon-50` background, `maroon-700` text, `rounded-md`, no border.
- **Urgent (queue alert):** the one animated exception in the system — a hard `step-start` flash between solid red and white, no fade, no easing. Reserved for "act now" states where a scout must notice from across a room; everything else in the system is static.

## 6. Do's and Don'ts

### Do:
- **Do** reserve `maroon-600`/`maroon-700` for actions and active states only — buttons, active tabs, links, required-field markers.
- **Do** render every scouting number (scores, ranks, team IDs, EPA) in Geist Mono via the Stat token, never the body font.
- **Do** use a 1px `graphite-200` border as the only depth cue for cards, inputs, and dividers — no shadows, ever.
- **Do** keep tap targets large (44px minimum) and contrast generous, well above AA-minimum — this app is used one-handed, outdoors, in bright light.
- **Do** keep corner radii small and consistent (6–8px) across buttons, cards, and inputs.

### Don't:
- **Don't** build a generic consumer-SaaS look — no soft gradients, no cute illustrations, no cream/pastel backgrounds, no "delightful onboarding" polish. This is a field tool, not a trial-signup flow.
- **Don't** add `box-shadow` anywhere. If something needs to feel separated, give it a border, not a lift.
- **Don't** let maroon fill a background or a card — it covers a button, an underline, or a header band at most.
- **Don't** use gradient text, glassmorphism, or side-stripe colored borders — none of that fits a flat, bordered, telemetry-driven system.
- **Don't** animate anything beyond the queue-blink alert without a strong reason; state changes here are instant and declarative, not choreographed.
