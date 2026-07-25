"use client";

import { useAppearance } from "@/components/AppearanceProvider";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  APPEARANCE_DOC_ID,
  DEFAULT_APPEARANCE,
  FONT_OPTIONS,
  fontStack,
  isHexColor,
  type AppearanceConfig,
} from "@/lib/appearance";
import { db } from "@/lib/firebase/client";
import { fileToResizedDataUrl, isImageFile } from "@/lib/imageFile";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useRef, useState } from "react";

type Status =
  | { state: "idle" }
  | { state: "saving" }
  | { state: "saved" }
  | { state: "error"; message: string };

/**
 * Team-wide look-and-feel editor: accent color, page background, app font, and
 * the top-left logo (drag-and-drop). Writes teams/{dataTeamId}/config/appearance;
 * AppearanceProvider picks the change up live for everyone on the team.
 */
export function AppearanceEditor() {
  const { profile, user, dataTeamId } = useAuth();
  const live = useAppearance();

  // Seed the draft from the live config once; edits stay local until Save.
  const [draft, setDraft] = useState<AppearanceConfig>(live);
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function update(patch: Partial<AppearanceConfig>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    if (status.state !== "idle") setStatus({ state: "idle" });
  }

  async function handleLogoFile(file: File) {
    if (!isImageFile(file)) {
      setStatus({ state: "error", message: "Drop an image file (PNG, JPG…)." });
      return;
    }
    setUploading(true);
    try {
      // Logos are small — cap tightly so the data URL stays lightweight.
      const dataUrl = await fileToResizedDataUrl(file, {
        maxDim: 256,
        quality: 0.9,
      });
      update({ logoUrl: dataUrl });
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Couldn't read that image.",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!dataTeamId || !user || !profile) return;
    if (!isHexColor(draft.accentColor) || !isHexColor(draft.backgroundColor)) {
      setStatus({ state: "error", message: "Colors must be valid hex values." });
      return;
    }
    setStatus({ state: "saving" });
    try {
      await setDoc(
        doc(db, "teams", dataTeamId, "config", APPEARANCE_DOC_ID),
        {
          accentColor: draft.accentColor,
          backgroundColor: draft.backgroundColor,
          fontKey: draft.fontKey,
          logoUrl: draft.logoUrl,
          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
          updatedByName: profile.fullName,
        },
        { merge: true },
      );
      setStatus({ state: "saved" });
    } catch (err) {
      setStatus({
        state: "error",
        message: err instanceof Error ? err.message : "Save failed",
      });
    }
  }

  function resetDefaults() {
    setDraft({ ...DEFAULT_APPEARANCE });
    if (status.state !== "idle") setStatus({ state: "idle" });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ColorField
          label="Accent color"
          hint="Buttons, header, links, highlights"
          value={draft.accentColor}
          onChange={(accentColor) => update({ accentColor })}
        />
        <ColorField
          label="Page background"
          hint="The base color behind every page"
          value={draft.backgroundColor}
          onChange={(backgroundColor) => update({ backgroundColor })}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-graphite-700">Font</span>
        <select
          value={draft.fontKey}
          onChange={(e) => update({ fontKey: e.target.value })}
          className="field-input"
          style={{ fontFamily: fontStack(draft.fontKey) }}
        >
          {FONT_OPTIONS.map((font) => (
            <option key={font.key} value={font.key}>
              {font.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-graphite-700">
          Top-left logo
        </span>
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-graphite-200 bg-white">
            {draft.logoUrl ? (
              // Runtime data/URL image — plain <img> (see AppHeader).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={draft.logoUrl}
                alt="Logo preview"
                className="h-14 w-14 rounded object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/lion-logo.png"
                alt="Default lion crest"
                className="h-14 w-14 rounded object-contain"
              />
            )}
          </div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void handleLogoFile(file);
            }}
            className={`flex flex-1 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-4 text-center text-sm transition ${
              dragOver
                ? "border-maroon-500 bg-maroon-50 text-maroon-700 dark:text-maroon-300"
                : "border-graphite-300 text-graphite-500 hover:border-graphite-400"
            }`}
          >
            {uploading
              ? "Reading image…"
              : dragOver
                ? "Drop to set logo"
                : "Drag a logo here, or click to choose"}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleLogoFile(file);
              e.target.value = "";
            }}
          />
        </div>
        {draft.logoUrl && (
          <button
            type="button"
            onClick={() => update({ logoUrl: "" })}
            className="btn-ghost self-start border border-graphite-200"
          >
            Reset to default logo
          </button>
        )}
      </div>

      {/* Live preview so the admin sees the combination before committing it. */}
      <div
        className="flex flex-col gap-3 rounded-lg border border-graphite-200 p-4"
        style={{
          background: draft.backgroundColor,
          fontFamily: fontStack(draft.fontKey),
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-widest text-graphite-500">
          Preview
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ background: draft.accentColor }}
          >
            Primary button
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: draft.accentColor }}
          >
            Accent link
          </span>
          <span className="text-sm text-graphite-700">Body text sample</span>
        </div>
      </div>

      {status.state === "error" && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {status.message}
        </p>
      )}
      {status.state === "saved" && (
        <p className="badge-success rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          Saved — the whole team&apos;s app updates right away.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={status.state === "saving"}
          className="btn-primary"
        >
          {status.state === "saving" ? "Saving…" : "Save appearance"}
        </button>
        <button
          type="button"
          onClick={resetDefaults}
          className="btn-secondary"
        >
          Reset to defaults
        </button>
      </div>
    </section>
  );
}

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const safe = isHexColor(value) ? value : "#000000";
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-graphite-700">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-10 w-12 shrink-0 cursor-pointer rounded border border-graphite-200 bg-surface"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="field-input stat"
        />
      </div>
      <span className="text-xs text-graphite-500">{hint}</span>
    </div>
  );
}
