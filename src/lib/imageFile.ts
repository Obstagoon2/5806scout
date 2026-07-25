// Turn a user-dropped image File into a compressed data URL that fits inside a
// Firestore document (1 MB hard cap). The app has no Blob/Storage bucket, so
// images ride along inside config docs — downscaling + JPEG re-encoding keeps
// them small enough. Used by the Event pit map and the Settings logo upload.

/** Firestore rejects docs ≥ 1 MB; stay comfortably under with headroom for
 *  the surrounding fields. Data URLs are base64, ~1.33× the raw byte size. */
export const MAX_IMAGE_DATA_URL_BYTES = 700_000;

export interface ResizeOptions {
  /** Longest-edge cap in pixels; the image scales down to fit, never up. */
  maxDim?: number;
  /** JPEG quality 0–1 for the re-encode (ignored for the PNG fallback). */
  quality?: number;
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Read `file`, downscale so its longest edge is ≤ maxDim, and re-encode as a
 * JPEG data URL (falling back to PNG when the source has transparency worth
 * keeping — logos). Rejects if the file isn't an image, can't be decoded, or
 * the encoded result still exceeds the Firestore-safe size.
 */
export async function fileToResizedDataUrl(
  file: File,
  { maxDim = 1600, quality = 0.82 }: ResizeOptions = {},
): Promise<string> {
  if (!isImageFile(file)) {
    throw new Error("That file isn't an image.");
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(sourceUrl);
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process the image in this browser.");
    ctx.drawImage(img, 0, 0, width, height);

    // PNG preserves the alpha channel logos rely on; photos (pit maps) compress
    // far better as JPEG. Pick JPEG unless the source was a PNG/lossless type.
    const preferPng = /png|gif|webp|svg/.test(file.type);
    const dataUrl = preferPng
      ? canvas.toDataURL("image/png")
      : canvas.toDataURL("image/jpeg", quality);

    if (dataUrl.length > MAX_IMAGE_DATA_URL_BYTES) {
      // A large PNG (or a still-huge JPEG) — retry once as a smaller JPEG.
      const retry = canvas.toDataURL("image/jpeg", 0.7);
      if (retry.length > MAX_IMAGE_DATA_URL_BYTES) {
        throw new Error(
          "That image is too large even after compression — try a smaller one.",
        );
      }
      return retry;
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read that image file."));
    img.src = src;
  });
}
