type Box = { type: string; start: number; end: number; size: number; header: number; dataStart: number };

function boxAt(view: DataView, start: number, end: number): Box {
  if (start + 8 > end) throw new Error("The video container has an incomplete atom header.");
  const size32 = view.getUint32(start);
  const type = String.fromCharCode(view.getUint8(start + 4), view.getUint8(start + 5), view.getUint8(start + 6), view.getUint8(start + 7));
  let size = size32;
  let header = 8;
  if (size32 === 1) {
    if (start + 16 > end) throw new Error("The video container has an incomplete extended atom header.");
    const extended = view.getBigUint64(start + 8);
    if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("This video is too large for local browser optimization.");
    size = Number(extended);
    header = 16;
  } else if (size32 === 0) {
    size = end - start;
  }
  if (size < header || start + size > end) throw new Error(`The ${type} atom has an invalid size.`);
  return { type, start, end: start + size, size, header, dataStart: start + header };
}

function childBoxes(view: DataView, parent: Box, prefixBytes = 0): Box[] {
  const children: Box[] = [];
  let offset = parent.dataStart + prefixBytes;
  while (offset < parent.end) {
    const child = boxAt(view, offset, parent.end);
    children.push(child);
    offset = child.end;
  }
  if (offset !== parent.end) throw new Error(`The ${parent.type} atom is malformed.`);
  return children;
}

async function topLevelBoxes(file: File): Promise<Box[]> {
  const boxes: Box[] = [];
  let offset = 0;
  while (offset < file.size) {
    if (boxes.length >= 128) throw new Error("This video has too many top-level atoms to optimize safely.");
    const bytes = new DataView(await file.slice(offset, Math.min(file.size, offset + 16)).arrayBuffer());
    const size32 = bytes.getUint32(0);
    let header = size32 === 1 ? 16 : 8;
    let size = size32;
    if (size32 === 1) {
      const extended = bytes.getBigUint64(8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("This video is too large for local browser optimization.");
      size = Number(extended);
    } else if (size32 === 0) {
      size = file.size - offset;
    }
    const end = offset + size;
    if (size < header || end > file.size) throw new Error("This file is not a supported MP4/MOV container.");
    const type = String.fromCharCode(bytes.getUint8(4), bytes.getUint8(5), bytes.getUint8(6), bytes.getUint8(7));
    boxes.push({ type, start: offset, end, size, header, dataStart: offset + header });
    offset = end;
  }
  if (offset !== file.size) throw new Error("This video container has an invalid atom layout.");
  return boxes;
}

function isContainer(type: string) {
  return new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "mvex", "udta", "tref", "ipro", "sinf", "schi", "meco", "hnti", "hinf", "strk", "strd", "strn", "wave"]).has(type);
}

function walkBoxes(view: DataView, box: Box, visit: (box: Box) => void) {
  visit(box);
  if (!isContainer(box.type) && box.type !== "meta") return;
  for (const child of childBoxes(view, box, box.type === "meta" ? 4 : 0)) walkBoxes(view, child, visit);
}

export type VideoInspection = {
  container: "MP4" | "MOV";
  estimatedFps: number | null;
  moovBeforeMdat: boolean;
  moovBytes: number;
  trackCount: number;
};

export async function inspectVideoFile(file: File): Promise<VideoInspection> {
  const boxes = await topLevelBoxes(file);
  const moov = boxes.filter(box => box.type === "moov");
  const mdats = boxes.filter(box => box.type === "mdat");
  if (moov.length !== 1 || mdats.length < 1) throw new Error("This video needs one movie header (`moov`) and at least one media-data (`mdat`) atom.");
  if (boxes.some(box => ["moof", "sidx", "mfra"].includes(box.type))) throw new Error("Fragmented MP4 files aren't supported by this local optimizer. Export a standard MP4/MOV and try again.");
  const moovBytes = await file.slice(moov[0].start, moov[0].end).arrayBuffer();
  const view = new DataView(moovBytes);
  const localMoov = boxAt(view, 0, view.byteLength);
  let videoTracks = 0;
  let fps: number | null = null;
  for (const track of childBoxes(view, localMoov).filter(box => box.type === "trak")) {
    const found: Box[] = [];
    walkBoxes(view, track, box => found.push(box));
    const handler = found.find(box => box.type === "hdlr");
    if (!handler || handler.dataStart + 12 > handler.end) continue;
    const handlerType = String.fromCharCode(view.getUint8(handler.dataStart + 8), view.getUint8(handler.dataStart + 9), view.getUint8(handler.dataStart + 10), view.getUint8(handler.dataStart + 11));
    if (handlerType !== "vide") continue;
    videoTracks += 1;
    const mdhd = found.find(box => box.type === "mdhd");
    const stts = found.find(box => box.type === "stts");
    if (!mdhd || !stts || stts.dataStart + 8 > stts.end) continue;
    const version = view.getUint8(mdhd.dataStart);
    const timescaleOffset = mdhd.dataStart + (version === 1 ? 20 : 12);
    if (timescaleOffset + 4 > mdhd.end) continue;
    const timescale = view.getUint32(timescaleOffset);
    if (!timescale) continue;
    const entryCount = view.getUint32(stts.dataStart + 4);
    let cursor = stts.dataStart + 8;
    let sampleCount = 0;
    let durationTicks = 0;
    for (let index = 0; index < entryCount && cursor + 8 <= stts.end; index += 1, cursor += 8) {
      const samples = view.getUint32(cursor);
      const delta = view.getUint32(cursor + 4);
      sampleCount += samples;
      durationTicks += samples * delta;
    }
    if (sampleCount > 0 && durationTicks > 0) fps = sampleCount * timescale / durationTicks;
  }
  if (!videoTracks) throw new Error("No video track was found in this file.");
  const container = boxes[0]?.type === "ftyp" ? "MP4" : "MOV";
  return { container, estimatedFps: fps, moovBeforeMdat: moov[0].start < mdats[0].start, moovBytes: moov[0].size, trackCount: videoTracks };
}

function patchChunkOffsets(moovBuffer: ArrayBuffer, moovSize: number, mdat: Box, moovStart: number) {
  const view = new DataView(moovBuffer);
  const moov = boxAt(view, 0, view.byteLength);
  const chunks: Box[] = [];
  walkBoxes(view, moov, box => chunks.push(box));
  if (chunks.some(box => ["cmov", "saio", "iloc", "tfra"].includes(box.type))) throw new Error("This file uses an offset table the local optimizer cannot safely move.");
  for (const box of chunks) {
    if (box.type !== "stco" && box.type !== "co64") continue;
    if (box.dataStart + 8 > box.end) throw new Error("A media chunk table in this file is incomplete.");
    const count = view.getUint32(box.dataStart + 4);
    const entrySize = box.type === "stco" ? 4 : 8;
    let cursor = box.dataStart + 8;
    if (cursor + count * entrySize > box.end) throw new Error("A media chunk table in this file is invalid.");
    for (let index = 0; index < count; index += 1, cursor += entrySize) {
      if (box.type === "stco") {
        const offset = view.getUint32(cursor);
        if (offset < mdat.dataStart || offset >= mdat.end) throw new Error("A sample chunk points outside the media-data atom; this file cannot be moved safely.");
        if (offset < moovStart) {
          const shifted = offset + moovSize;
          if (shifted > 0xffffffff) throw new Error("This file needs a 64-bit chunk table to move its movie header safely.");
          view.setUint32(cursor, shifted);
        }
      } else {
        const offset = view.getBigUint64(cursor);
        if (offset < BigInt(mdat.dataStart) || offset >= BigInt(mdat.end)) throw new Error("A sample chunk points outside the media-data atom; this file cannot be moved safely.");
        if (offset < BigInt(moovStart)) view.setBigUint64(cursor, offset + BigInt(moovSize));
      }
    }
  }
  return moovBuffer;
}

export async function optimizeMp4Locally(file: File): Promise<{ blob: Blob; movedMoov: boolean }> {
  const boxes = await topLevelBoxes(file);
  const moov = boxes.filter(box => box.type === "moov");
  const mdats = boxes.filter(box => box.type === "mdat");
  if (moov.length !== 1 || mdats.length !== 1) throw new Error("Safe fast-start optimization requires one `moov` and one `mdat` atom.");
  if (boxes.some(box => ["moof", "sidx", "mfra"].includes(box.type))) throw new Error("Fragmented MP4 files aren't supported. Export a standard MP4/MOV and try again.");
  if (moov[0].start < mdats[0].start) return { blob: new Blob([file], { type: file.type || "video/mp4" }), movedMoov: false };
  const moovBuffer = await file.slice(moov[0].start, moov[0].end).arrayBuffer();
  const patchedMoov = patchChunkOffsets(moovBuffer, moov[0].size, mdats[0], moov[0].start);
  const output = new Blob([
    file.slice(0, mdats[0].start),
    patchedMoov,
    file.slice(mdats[0].start, moov[0].start),
    file.slice(moov[0].end),
  ], { type: file.type || "video/mp4" });
  return { blob: output, movedMoov: true };
}
