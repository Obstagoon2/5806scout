import { crc32, dataUrlBytes, zipEntries } from "@/lib/zip";
import { describe, expect, it } from "vitest";

const enc = (s: string) => new TextEncoder().encode(s);
const u32 = (b: Uint8Array, o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);

describe("crc32", () => {
  it("matches the known checksum for a standard vector", () => {
    // "123456789" -> 0xCBF43926 is the canonical CRC-32 test vector.
    expect(crc32(enc("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for empty input", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("zipEntries", () => {
  it("writes a readable local header and stores bytes verbatim", () => {
    const zip = zipEntries([{ name: "a.txt", bytes: enc("hello") }]);
    expect(u32(zip, 0)).toBe(0x04034b50);
    expect(u16(zip, 8)).toBe(0); // stored, not deflated
    expect(u32(zip, 14)).toBe(crc32(enc("hello")));
    expect(u32(zip, 18)).toBe(5); // compressed size
    expect(u32(zip, 22)).toBe(5); // uncompressed size
    expect(u16(zip, 26)).toBe(5); // name length
    const name = new TextDecoder().decode(zip.slice(30, 35));
    expect(name).toBe("a.txt");
    expect(new TextDecoder().decode(zip.slice(35, 40))).toBe("hello");
  });

  it("ends with an EOCD that counts every entry", () => {
    const zip = zipEntries([
      { name: "a.txt", bytes: enc("one") },
      { name: "b/c.txt", bytes: enc("two") },
    ]);
    const eocd = zip.length - 22;
    expect(u32(zip, eocd)).toBe(0x06054b50);
    expect(u16(zip, eocd + 8)).toBe(2);
    expect(u16(zip, eocd + 10)).toBe(2);
    // Central directory offset + size must land exactly on the EOCD.
    expect(u32(zip, eocd + 16) + u32(zip, eocd + 12)).toBe(eocd);
  });

  it("points each central directory entry at its local header", () => {
    const zip = zipEntries([
      { name: "a.txt", bytes: enc("one") },
      { name: "b.txt", bytes: enc("two") },
    ]);
    const eocd = zip.length - 22;
    const cdStart = u32(zip, eocd + 16);
    expect(u32(zip, cdStart)).toBe(0x02014b50);
    // First entry sits at offset 0; the second must not.
    expect(u32(zip, cdStart + 42)).toBe(0);
    const second = cdStart + 46 + u16(zip, cdStart + 28);
    expect(u32(zip, second)).toBe(0x02014b50);
    expect(u32(zip, second + 42)).toBeGreaterThan(0);
  });

  it("produces the same bytes for the same input", () => {
    const make = () => zipEntries([{ name: "a.txt", bytes: enc("x") }], new Date(0));
    expect(Array.from(make())).toEqual(Array.from(make()));
  });

  it("writes a valid empty archive", () => {
    const zip = zipEntries([]);
    expect(zip.length).toBe(22);
    expect(u32(zip, 0)).toBe(0x06054b50);
  });
});

describe("dataUrlBytes", () => {
  it("decodes a base64 image and names its extension", () => {
    // 1x1 transparent GIF.
    const gif =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    const out = dataUrlBytes(gif)!;
    expect(out.extension).toBe("gif");
    // GIF magic number.
    expect(Array.from(out.bytes.slice(0, 3))).toEqual([0x47, 0x49, 0x46]);
  });

  it("maps the image mime types the forms capture", () => {
    expect(dataUrlBytes("data:image/jpeg;base64,QQ==")!.extension).toBe("jpg");
    expect(dataUrlBytes("data:image/png;base64,QQ==")!.extension).toBe("png");
    expect(dataUrlBytes("data:image/webp;base64,QQ==")!.extension).toBe("webp");
    expect(dataUrlBytes("data:application/pdf;base64,QQ==")!.extension).toBe("bin");
  });

  it("returns null for anything that isn't a data URL", () => {
    expect(dataUrlBytes(null)).toBeNull();
    expect(dataUrlBytes(undefined)).toBeNull();
    expect(dataUrlBytes(42)).toBeNull();
    expect(dataUrlBytes("")).toBeNull();
    expect(dataUrlBytes("https://example.com/a.png")).toBeNull();
  });

  it("returns null rather than throwing on malformed base64", () => {
    expect(dataUrlBytes("data:image/png;base64,!!!not base64!!!")).toBeNull();
  });
});
