import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inspectMedia } from "@/lib/inspect-media";
import { getVideoJob } from "@/lib/video-jobs";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function isPublicAddress(address: string) {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized.startsWith("2") || normalized.startsWith("3"); // Global unicast only; blocks loopback, link-local, ULA, and mapped/private ranges.
  }
  return false;
}

async function inspectUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Enter a valid direct MP4/MOV URL.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || !/\.(mp4|mov)$/i.test(url.pathname)) throw new Error("Use a public HTTPS URL ending in .mp4 or .mov.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) throw new Error("Local/private video URLs are not supported.");
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) throw new Error("The URL host must resolve to a public internet address.");
  return inspectMedia(url.href, undefined, true);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to inspect uploaded videos." }, { status: 401 });
  let tempDirectory: string | undefined;
  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body?.jobId && typeof body.jobId === "string") {
        const job = getVideoJob(body.jobId);
        if (!job || job.status !== "complete") return NextResponse.json({ error: "The processed video is not ready." }, { status: 404 });
        if (job.userId !== session.user.id) return NextResponse.json({ error: "This job belongs to another account." }, { status: 403 });
        return NextResponse.json(await inspectMedia(job.outputPath));
      }
      return NextResponse.json(await inspectUrl(body?.videoUrl));
    }

    const form = await request.formData();
    const file = form.get("video") ?? form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach an MP4 or MOV video." }, { status: 400 });
    const extension = file.name.toLowerCase().split(".").pop();
    if (!(extension === "mp4" || extension === "mov") || file.size === 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Choose an MP4/MOV file up to 100 MB." }, { status: 413 });
    }
    tempDirectory = await mkdtemp(path.join(tmpdir(), "topaz-probe-"));
    const inputPath = path.join(tempDirectory, `upload.${extension}`);
    await writeFile(inputPath, new Uint8Array(await file.arrayBuffer()));
    return NextResponse.json(await inspectMedia(inputPath, file.size));
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Could not inspect this video.";
    return NextResponse.json({ error: message }, { status: 422 });
  } finally {
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true });
  }
}
