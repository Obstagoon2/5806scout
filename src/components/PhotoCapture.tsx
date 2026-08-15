"use client";

import { fileToResizedDataUrl } from "@/lib/imageFile";
import { useRef, useState } from "react";

// Camera / gallery capture for a form field. On a phone the capture hint opens
// the rear camera straight away — a scout in the pit taps once and shoots.
// The photo is downscaled to a data URL so it rides inside the submission doc
// (the app has no Storage bucket; see imageFile.ts).

/** A submission can carry a photo *and* a drawing *and* every other answer in
 *  one Firestore doc (1 MB hard cap), so a form photo gets a tighter budget
 *  than imageFile.ts's standalone-image ceiling. */
const PHOTO_MAX_DIM = 1000;
const PHOTO_QUALITY = 0.72;
const PHOTO_MAX_BYTES = 400_000;
/** Second pass when the first encode overshoots the budget. */
const PHOTO_FALLBACK = { maxDim: 720, quality: 0.6 };

interface PhotoCaptureProps {
  label: string;
  hint?: string;
  required?: boolean;
  /** JPEG data URL, or null when no photo has been taken. */
  value: string | null;
  onChange: (value: string | null) => void;
}

export function PhotoCapture({
  label,
  hint,
  required,
  value,
  onChange,
}: PhotoCaptureProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      let dataUrl = await fileToResizedDataUrl(file, {
        maxDim: PHOTO_MAX_DIM,
        quality: PHOTO_QUALITY,
      });
      if (dataUrl.length > PHOTO_MAX_BYTES) {
        dataUrl = await fileToResizedDataUrl(file, PHOTO_FALLBACK);
      }
      if (dataUrl.length > PHOTO_MAX_BYTES) {
        throw new Error(
          "That photo is too detailed to fit in the form — try again from further back.",
        );
      }
      onChange(dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that photo.");
    } finally {
      setBusy(false);
      // Clearing the input lets the same file be picked again after a retake.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-graphite-700">
        {label}
        {required && (
          <span className="ml-0.5 text-maroon-600 dark:text-maroon-400">*</span>
        )}
      </span>
      {hint && <p className="text-xs text-graphite-500">{hint}</p>}

      {value && (
        // A data URL, not a remote asset next/image could optimize.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt={label}
          className="w-full rounded-md border border-graphite-200 object-contain"
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label={label}
        onChange={(e) => void handleFile(e.target.files?.[0])}
        className="sr-only"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="btn-secondary disabled:opacity-40"
        >
          {busy ? "Processing…" : value ? "Retake photo" : "Take photo"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onChange(null);
            }}
            className="btn-secondary"
          >
            Remove
          </button>
        )}
      </div>

      {error && (
        <p className="badge-error rounded-md px-3 py-2 text-sm normal-case tracking-normal">
          {error}
        </p>
      )}
    </div>
  );
}
