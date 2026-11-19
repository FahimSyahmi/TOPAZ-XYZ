type LayoutBox = { type: string; start: number; size: number; header: number };
type Layout = { fileSize: number; boxes: LayoutBox[] };
type Part = { src: [number, number] } | { b: string };

function readBox(bytes: Buffer, start: number, end: number) {
  if (start + 8 > end) throw new Error("An MP4 atom header is incomplete.");
  const size32 = bytes.readUInt32BE(start);
  const type = bytes.toString("ascii", start + 4, start + 8);
  let size = size32;
  let header = 8;
  if (size32 === 1) {
    if (start + 16 > end) throw new Error("An extended MP4 atom header is incomplete.");
    const largeSize = bytes.readBigUInt64BE(start + 8);
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("This atom is too large to process safely.");
    size = Number(largeSize); header = 16;
  } else if (size32 === 0) size = end - start;
  if (size < header || start + size > end) throw new Error(`The ${type} atom has an invalid size.`);
  return { type, start, size, header, end: start + size, dataStart: start + header };
}

const containers = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta", "mvex", "moof", "traf", "mfra", "meta"]);
function descendants(bytes: Buffer, start: number, end: number, result: ReturnType<typeof readBox>[] = [], depth = 0): ReturnType<typeof readBox>[] {
  if (depth > 16) throw new Error("The MP4 atom tree is nested too deeply.");
  let cursor = start;
  while (cursor < end) {
    const box = readBox(bytes, cursor, end);
    result.push(box);
    if (containers.has(box.type)) descendants(bytes, box.dataStart + (box.type === "meta" ? 4 : 0), box.end, result, depth + 1);
    cursor = box.end;
  }
  if (cursor !== end) throw new Error("An MP4 atom is malformed.");
  return result;
}

function decodeHeader(header: string) {
  if (typeof header !== "string" || header.length > 23 * 1024 * 1024) throw new Error("The encoded header is too large.");
  const bytes = Buffer.from(header, "base64");
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error("The MP4 header must be between 1 byte and 16 MB.");
  return bytes;
}

export function createPatchPlan(layout: Layout, encodedHeader: string) {
  if (!layout || !Number.isSafeInteger(layout.fileSize) || layout.fileSize < 16 || layout.fileSize > 2 ** 40) throw new Error("The video file size is invalid.");
  if (!Array.isArray(layout.boxes) || layout.boxes.length < 3 || layout.boxes.length > 64) throw new Error("A layout must contain 3–64 top-level atoms.");
  const packedHeader = decodeHeader(encodedHeader);
  let packedOffset = 0;
  let expectedStart = 0;
  let moov: (LayoutBox & { packedStart: number }) | undefined;
  let mdat: LayoutBox | undefined;
  let moovCount = 0;
  let mdatCount = 0;
  const boxes = layout.boxes.map((input, index) => {
    if (!input || typeof input.type !== "string" || input.type.length !== 4 || !Number.isSafeInteger(input.start) || !Number.isSafeInteger(input.size) || !Number.isSafeInteger(input.header)) throw new Error("A top-level atom entry is invalid.");
    if (input.start !== expectedStart || input.size < input.header || ![8, 16].includes(input.header) || input.start + input.size > layout.fileSize) throw new Error("Top-level atoms must be contiguous and match the file size.");
    expectedStart += input.size;
    if (index === 0 && input.type !== "ftyp") throw new Error("The first top-level atom must be ftyp.");
    if (["moof", "sidx", "mfra"].includes(input.type)) throw new Error("Fragmented MP4 files are not supported by this engine.");
    let packedStart = -1;
    if (input.type !== "mdat") {
      packedStart = packedOffset;
      if (packedOffset + input.header > packedHeader.length) throw new Error("The header data does not match the supplied layout.");
      const atom = readBox(packedHeader, packedOffset, packedHeader.length);
      if (atom.type !== input.type || atom.size !== input.size || atom.header !== input.header) throw new Error("The header atom does not match the supplied layout.");
      packedOffset += input.size;
    }
    if (input.type === "moov") { moovCount += 1; moov = { ...input, packedStart }; }
    if (input.type === "mdat") { mdatCount += 1; mdat = input; }
    return { ...input, packedStart };
  });
  if (expectedStart !== layout.fileSize || packedOffset !== packedHeader.length) throw new Error("The layout/header length does not match the supplied file size.");
  if (moovCount !== 1 || mdatCount !== 1 || !moov || !mdat) throw new Error("Safe fast-start requires exactly one moov atom and one mdat atom.");
  if (moov.start < mdat.start) return { engine: "topaz-faststart-v1", changed: false, size: layout.fileSize, parts: [{ src: [0, layout.fileSize] as [number, number] }] as Part[] };

  const moovBytes = Buffer.from(packedHeader.subarray(moov.packedStart, moov.packedStart + moov.size));
  const nested = descendants(moovBytes, 0, moovBytes.length);
  if (nested.some(box => ["cmov", "saio", "iloc", "tfra"].includes(box.type))) throw new Error("This video contains an offset table the engine cannot safely move.");
  for (const box of nested) {
    if (box.type !== "stco" && box.type !== "co64") continue;
    if (box.dataStart + 8 > box.end) throw new Error("A chunk offset table is incomplete.");
    const count = moovBytes.readUInt32BE(box.dataStart + 4);
    const entrySize = box.type === "stco" ? 4 : 8;
    let cursor = box.dataStart + 8;
    if (cursor + count * entrySize > box.end) throw new Error("A chunk offset table is invalid.");
    for (let index = 0; index < count; index += 1, cursor += entrySize) {
      const offset = box.type === "stco" ? moovBytes.readUInt32BE(cursor) : moovBytes.readBigUInt64BE(cursor);
      const mediaStart = BigInt(mdat.start + mdat.header);
      const mediaEnd = BigInt(mdat.start + mdat.size);
      if (typeof offset === "number" ? offset < Number(mediaStart) || offset >= Number(mediaEnd) : offset < mediaStart || offset >= mediaEnd) throw new Error("A sample chunk points outside the media-data atom.");
      if (typeof offset === "number") {
        const adjusted = offset + moov.size;
        if (adjusted > 0xffffffff) throw new Error("This file needs a 64-bit chunk table before it can be moved safely.");
        moovBytes.writeUInt32BE(adjusted, cursor);
      } else moovBytes.writeBigUInt64BE(offset + BigInt(moov.size), cursor);
    }
  }
  const parts: Part[] = [
    { src: [0, mdat.start] },
    { b: moovBytes.toString("base64") },
    { src: [mdat.start, moov.start] },
    { src: [moov.start + moov.size, layout.fileSize] },
  ];
  return { engine: "topaz-faststart-v1", changed: true, size: layout.fileSize, parts };
}
