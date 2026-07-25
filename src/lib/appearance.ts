// Team-wide website customization: an admin picks an accent color, a page
// background, a font, and a top-left logo, stored at
// teams/{dataTeamId}/config/appearance. The whole palette in globals.css is
// defined as CSS custom properties (--color-maroon-*, --background,
// --font-sans) and mapped through Tailwind's @theme inline, so overriding
// those variables at runtime re-skins every utility class app-wide without
// touching components. This module is the pure core: types, hex<->hsl math,
// scale derivation, and the CSS text — all testable without a DOM.

export const APPEARANCE_DOC_ID = "appearance";

export interface AppearanceConfig {
  /** Brand/accent hex (#rrggbb) — replaces maroon on buttons, header, links. */
  accentColor: string;
  /** Page background hex (#rrggbb) — the body layer in light mode. */
  backgroundColor: string;
  /** Key into FONT_OPTIONS; drives the whole-app sans font. */
  fontKey: string;
  /** Top-left logo: data URL or external URL. Empty = the default lion crest. */
  logoUrl: string;
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  accentColor: "#7a1a24", // maroon-600, the shipped brand color
  backgroundColor: "#faf7f5", // the shipped --background
  fontKey: "geist",
  logoUrl: "",
};

export interface FontOption {
  key: string;
  label: string;
  /** CSS font-family stack — all system-available, so no network load. */
  stack: string;
}

// Curated, network-free font stacks. "Geist" is the shipped default (loaded by
// next/font); the rest are system stacks so switching is instant and offline.
export const FONT_OPTIONS: readonly FontOption[] = [
  {
    key: "geist",
    label: "Geist (default)",
    stack: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  },
  {
    key: "system",
    label: "System Sans",
    stack:
      'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  {
    key: "serif",
    label: "Serif",
    stack: 'Georgia, Cambria, "Times New Roman", Times, serif',
  },
  {
    key: "rounded",
    label: "Rounded",
    stack:
      'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", "Nunito", system-ui, sans-serif',
  },
  {
    key: "mono",
    label: "Monospace",
    stack:
      'var(--font-geist-mono), ui-monospace, "SFMono-Regular", Menlo, monospace',
  },
];

export function fontStack(fontKey: string): string {
  return (
    FONT_OPTIONS.find((f) => f.key === fontKey)?.stack ?? FONT_OPTIONS[0].stack
  );
}

/** Per-shade target lightness (%) mirroring the shipped maroon ramp, so a
 *  derived scale keeps the same light→dark rhythm the UI was tuned against. */
const SHADE_LIGHTNESS: Record<number, number> = {
  50: 96,
  100: 90,
  200: 78,
  300: 66,
  400: 53,
  500: 38,
  600: 32,
  700: 25,
  800: 19,
  900: 12,
};

/** Solid, non-tint shades — safe to override in BOTH themes because globals.css
 *  never flips them for dark mode (only maroon-50/100 tints flip). */
export const SOLID_SHADES: readonly number[] = [400, 500, 600, 700, 800, 900];

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0 };
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = ln - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** Build a 50–900 shade ramp in the accent's hue, matching the shipped ramp's
 *  lightness steps. Very light shades desaturate a touch so tints don't glow. */
export function deriveAccentScale(accent: string): Record<number, string> {
  const { h, s } = hexToHsl(accent);
  const out: Record<number, string> = {};
  for (const [shade, l] of Object.entries(SHADE_LIGHTNESS)) {
    const n = Number(shade);
    const sat = n <= 100 ? s * 0.55 : s;
    out[n] = hslToHex(h, Math.min(100, sat), l);
  }
  return out;
}

/** Coerce a raw Firestore snapshot into a valid config, falling back per-field
 *  so a partial or malformed doc can never break the whole app's theming. */
export function sanitizeAppearance(raw: unknown): AppearanceConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_APPEARANCE };
  const r = raw as Partial<AppearanceConfig>;
  return {
    accentColor:
      typeof r.accentColor === "string" && isHexColor(r.accentColor)
        ? r.accentColor
        : DEFAULT_APPEARANCE.accentColor,
    backgroundColor:
      typeof r.backgroundColor === "string" && isHexColor(r.backgroundColor)
        ? r.backgroundColor
        : DEFAULT_APPEARANCE.backgroundColor,
    fontKey:
      typeof r.fontKey === "string" &&
      FONT_OPTIONS.some((f) => f.key === r.fontKey)
        ? r.fontKey
        : DEFAULT_APPEARANCE.fontKey,
    logoUrl: typeof r.logoUrl === "string" ? r.logoUrl : "",
  };
}

/** Whether a config is just the shipped defaults — lets the provider skip
 *  injecting an override stylesheet entirely when nothing is customized. */
export function isDefaultAppearance(cfg: AppearanceConfig): boolean {
  return (
    cfg.accentColor.toLowerCase() ===
      DEFAULT_APPEARANCE.accentColor.toLowerCase() &&
    cfg.backgroundColor.toLowerCase() ===
      DEFAULT_APPEARANCE.backgroundColor.toLowerCase() &&
    cfg.fontKey === DEFAULT_APPEARANCE.fontKey
  );
}

/**
 * The CSS that re-skins the app for `cfg`. Light `:root` gets the full accent
 * ramp + background + font; `.dark` gets only the solid accent shades + font,
 * leaving dark mode's tuned neutrals and dark background intact for contrast.
 */
export function appearanceCss(cfg: AppearanceConfig): string {
  const scale = deriveAccentScale(cfg.accentColor);
  const stack = fontStack(cfg.fontKey);

  const lightVars = [
    ...Object.entries(scale).map(([n, hex]) => `--color-maroon-${n}:${hex};`),
    `--background:${cfg.backgroundColor};`,
    `--font-sans:${stack};`,
  ].join("");

  const darkVars = [
    ...SOLID_SHADES.map((n) => `--color-maroon-${n}:${scale[n]};`),
    `--font-sans:${stack};`,
  ].join("");

  return `:root{${lightVars}}\n.dark{${darkVars}}`;
}
