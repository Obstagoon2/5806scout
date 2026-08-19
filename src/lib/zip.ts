// A minimal ZIP writer, store-only (no compression).
//
// Robot photos are the one export that can't be a single file, and browsers
// block a page that fires several downloads in a row — so the choice is one
// archive or nothing. The photos are already JPEG/PNG, which deflate can't
// meaningfully shrink, so storing them uncompressed costs almost nothing and
// saves pulling in a compression dependency for one button.
//
// Only the fields a reader needs are written: local header, central directory,
// end-of-central-directory. No zip64, so this tops out at 4 GB per archive and
// 65535 entries — orders of magnitude past a pit's worth of photos.

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
/** "Stored" — the archive carries the bytes verbatim. */
const METHOD_STORE = 0;

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** MS-DOS packed date and time — the only format the header has room for. */
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (Math.floor(date.getSeconds() / 2) & 0x1f),
    // Years count from 1980; anything earlier can't be represented.
    date:
      (Math.max(0, date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

class ByteWriter {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.push(
      new Uint8Array([
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      ]),
    );
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const part of this.parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }
}

/**
 * Pack entries into a ZIP archive. `at` stamps every entry — passed in rather
 * than read from the clock so the same input always produces the same bytes.
 */
export function zipEntries(
  entries: readonly ZipEntry[],
  at: Date = new Date(0),
): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(at);
  const body = new ByteWriter();
  const central = new ByteWriter();

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const offset = body.length;

    body.u32(LOCAL_SIG);
    body.u16(20); // version needed
    body.u16(0); // flags
    body.u16(METHOD_STORE);
    body.u16(time);
    body.u16(date);
    body.u32(crc);
    body.u32(entry.bytes.length); // compressed == uncompressed when stored
    body.u32(entry.bytes.length);
    body.u16(name.length);
    body.u16(0); // extra length
    body.push(name);
    body.push(entry.bytes);

    central.u32(CENTRAL_SIG);
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(0);
    central.u16(METHOD_STORE);
    central.u16(time);
    central.u16(date);
    central.u32(crc);
    central.u32(entry.bytes.length);
    central.u32(entry.bytes.length);
    central.u16(name.length);
    central.u16(0); // extra
    central.u16(0); // comment
    central.u16(0); // disk number
    central.u16(0); // internal attrs
    central.u32(0); // external attrs
    central.u32(offset);
    central.push(name);
  }

  const out = new ByteWriter();
  out.push(body.concat());
  const centralBytes = central.concat();
  out.push(centralBytes);
  out.u32(EOCD_SIG);
  out.u16(0); // this disk
  out.u16(0); // disk with central directory
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(centralBytes.length);
  out.u32(body.length);
  out.u16(0); // comment length
  return out.concat();
}

/**
 * The bytes and file extension behind a `data:` URL, or null when the value
 * isn't one — a photo field that was never filled in, or a stored answer that
 * isn't media at all.
 */
export function dataUrlBytes(
  value: unknown,
): { bytes: Uint8Array; extension: string } | null {
  if (typeof value !== "string") return null;
  // [\s\S] rather than the /s flag — tsconfig targets ES2017, which predates
  // dotAll, and a data URL's payload can contain newlines.
  const match = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(value);
  if (!match) return null;
  const [, mime, isBase64, payload] = match;
  try {
    const binary = isBase64
      ? atob(payload)
      : decodeURIComponent(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, extension: extensionFor(mime) };
  } catch {
    return null;
  }
}

function extensionFor(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}
