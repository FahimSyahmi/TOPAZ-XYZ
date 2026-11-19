const MAX_HEADER_BYTES = 16 * 1024 * 1024;
const containers = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta", "mvex", "tref", "ipro", "sinf", "schi", "meco", "hnti", "hinf", "strk", "strd", "strn", "wave"]);

function decodeSize(view, offset, fileRemaining) {
  if (offset + 8 > view.byteLength) throw new Error("An MP4 atom header is incomplete.");
  const size32 = view.getUint32(offset);
  const type = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5), view.getUint8(offset + 6), view.getUint8(offset + 7));
  let size = size32;
  let header = 8;
  if (size32 === 1) {
    if (offset + 16 > view.byteLength) throw new Error("An extended MP4 atom header is incomplete.");
    const largeSize = view.getBigUint64(offset + 8);
    if (largeSize > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("This atom is too large for the Topaz Engine client.");
    size = Number(largeSize); header = 16;
  } else if (size32 === 0) size = fileRemaining;
  if (size < header || size > fileRemaining) throw new Error(`The ${type} atom has an invalid size.`);
  return { type, start: offset, size, header, end: offset + size };
}

function toBase64(bytes) {
  let binary = "";
  const step = 0x8000;
  for (let start = 0; start < bytes.length; start += step) binary += String.fromCharCode(...bytes.subarray(start, start + step));
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function prepare(file) {
  if (!(file instanceof Blob) || !Number.isSafeInteger(file.size) || file.size < 16) throw new Error("Choose a valid MP4 or MOV file.");
  const boxes = [];
  const headerParts = [];
  let offset = 0;
  let headerLength = 0;
  while (offset < file.size) {
    if (boxes.length >= 64) throw new Error("The video has too many top-level atoms for this API.");
    const bytes = new DataView(await file.slice(offset, Math.min(file.size, offset + 16)).arrayBuffer());
    const atom = decodeSize(bytes, 0, file.size - offset);
    let size = atom.size;
    if (bytes.getUint32(0) === 0) size = file.size - offset;
    if (size < atom.header || offset + size > file.size) throw new Error("The video has an invalid top-level atom layout.");
    const entry = { type: atom.type, start: offset, size, header: atom.header };
    boxes.push(entry);
    if (atom.type !== "mdat") {
      headerLength += size;
      if (headerLength > MAX_HEADER_BYTES) throw new Error("The video header exceeds the 16 MB API limit.");
      headerParts.push(new Uint8Array(await file.slice(offset, offset + size).arrayBuffer()));
    }
    offset += size;
  }
  if (offset !== file.size || boxes[0]?.type !== "ftyp") throw new Error("Expected a standard MP4/MOV file with ftyp as its first atom.");
  const header = new Uint8Array(headerLength);
  let cursor = 0;
  for (const part of headerParts) { header.set(part, cursor); cursor += part.length; }
  return { layout: { fileSize: file.size, boxes }, header: toBase64(header) };
}

export function assemble(file, plan) {
  if (!(file instanceof Blob) || !plan || !Array.isArray(plan.parts) || !Number.isSafeInteger(plan.size) || plan.size !== file.size) throw new Error("The Topaz Engine plan does not match this source video.");
  const parts = [];
  let total = 0;
  for (const part of plan.parts) {
    if (part && Array.isArray(part.src) && part.src.length === 2) {
      const [start, end] = part.src;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > file.size) throw new Error("The plan contains an invalid source range.");
      parts.push(file.slice(start, end)); total += end - start;
    } else if (part && typeof part.b === "string") {
      const bytes = fromBase64(part.b); parts.push(bytes); total += bytes.length;
    } else throw new Error("The plan contains an unsupported output part.");
  }
  if (total !== plan.size) throw new Error("The Topaz Engine plan has an invalid output size.");
  return new Blob(parts, { type: file.type || "video/mp4" });
}

export async function optimize(file, { apiUrl = "/api/topaz/patch", requestId = crypto.randomUUID() } = {}) {
  const prepared = await prepare(file);
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, ...prepared }),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || "Topaz Engine request failed.");
    error.code = result.code;
    error.status = response.status;
    throw error;
  }
  return { blob: assemble(file, result), engine: result.engine, changed: result.changed, requestId: result.requestId };
}

export const TopazEngine = { prepare, assemble, optimize };
