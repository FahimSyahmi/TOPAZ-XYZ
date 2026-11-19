import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
import { refundCredits } from "@/lib/credits";

export type VideoJob = { id: string; status: "queued" | "processing" | "complete" | "failed"; progress: number; stage: string; error?: string; directory: string; outputPath: string; createdAt: number; userId: string; creditCharge: number; refunded: boolean; };
const jobs = new Map<string, VideoJob>();
const MAX_JOB_AGE = 30 * 60 * 1000;

function cleanupExpired() {
  const cutoff = Date.now() - MAX_JOB_AGE;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) {
      jobs.delete(id);
      void rm(job.directory, { recursive: true, force: true });
    }
  }
}

export function getVideoJob(id: string) { cleanupExpired(); return jobs.get(id); }

export async function startVideoJob(input: { name: string; bytes: ArrayBuffer; fps: 24 | 25 | 30 | 50 | 60 | 120; maxDimension: 1920 | 3840; duration: number; interpolate?: boolean; userId: string; creditCharge: number }) {
  cleanupExpired();
  const ffmpegBinary = ffmpegPath;
  if (!ffmpegBinary) throw new Error("FFmpeg is unavailable on this server. Reinstall dependencies and restart the app.");
  const id = crypto.randomUUID();
  const directory = await mkdtemp(path.join(tmpdir(), "topaz-video-"));
  const inputPath = path.join(directory, `source${path.extname(input.name).toLowerCase() === ".mov" ? ".mov" : ".mp4"}`);
  const outputPath = path.join(directory, "topaz-enhanced.mp4");
  await writeFile(inputPath, new Uint8Array(input.bytes));
  const job: VideoJob = { id, status: "queued", progress: 0, stage: "Starting FFmpeg…", directory, outputPath, createdAt: Date.now(), userId: input.userId, creditCharge: input.creditCharge, refunded: false };
  jobs.set(id, job);

  const dimension = input.maxDimension;
  const filters = [
    "hqdn3d=1.5:1.5:6:6",
    `scale=w='if(gte(iw,ih),min(${dimension},iw*2),-2)':h='if(gte(iw,ih),-2,min(${dimension},ih*2))':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos`,
    "cas=0.6",
    "eq=contrast=1.04:saturation=1.06",
  ];
  if (input.interpolate) filters.push(`minterpolate=fps=${input.fps}:mi_mode=blend`);
  const filter = filters.join(",");
  const level = input.maxDimension === 3840 ? "5.2" : "4.2";
  const args = ["-hide_banner", "-y", "-i", inputPath, "-map", "0:v:0", "-map", "0:a?", "-vf", filter, "-c:v", "libx264", "-crf", "17", "-preset", "fast", "-profile:v", "high", "-level", level, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", outputPath];

  void new Promise<void>((resolve, reject) => {
    job.status = "processing";
    job.stage = "Upscaling and generating smooth frames…";
    const child = spawn(ffmpegBinary, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] as const });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      const lines = stdout.split(/\r?\n/);
      stdout = lines.pop() ?? "";
      for (const line of lines) {
        const [key, value] = line.split("=", 2);
        if (key === "out_time_ms" && input.duration > 0) {
          const seconds = Number(value) / 1_000_000;
          job.progress = Math.min(97, Math.max(job.progress, Math.round((seconds / input.duration) * 96)));
          if (job.progress > 65) job.stage = "Encoding optimized MP4…";
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-8000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(stderr.match(/(?:Error|Invalid|No such file)[^\r\n]*/i)?.[0] || `FFmpeg exited with code ${code}.`)));
  }).then(() => {
    job.status = "complete"; job.progress = 100; job.stage = "Ready to download";
    void rm(inputPath, { force: true });
    setTimeout(() => { if (jobs.get(id) === job) { jobs.delete(id); void rm(directory, { recursive: true, force: true }); } }, MAX_JOB_AGE).unref?.();
  }).catch(async reason => {
    job.status = "failed"; job.stage = "Processing failed"; job.error = reason instanceof Error ? reason.message : "FFmpeg processing failed.";
    if (job.creditCharge > 0 && !job.refunded) {
      job.refunded = true;
      try { await refundCredits(job.userId, job.creditCharge); } catch { job.refunded = false; }
    }
    await rm(directory, { recursive: true, force: true });
  });

  return id;
}

export async function readVideoOutput(job: VideoJob) { return readFile(job.outputPath); }
