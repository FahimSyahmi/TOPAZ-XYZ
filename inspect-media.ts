import { spawn } from "node:child_process";
import { path as ffprobePath } from "ffprobe-static";

type ProbeStream = {
  codec_type?: string; codec_name?: string; width?: number; height?: number;
  r_frame_rate?: string; avg_frame_rate?: string; bit_rate?: string;
  color_space?: string; color_transfer?: string; color_primaries?: string;
};
type ProbeData = { streams?: ProbeStream[]; format?: { duration?: string; size?: string; bit_rate?: string } };

function rational(value?: string) {
  if (!value) return null;
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const fps = numerator / denominator;
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 100) / 100 : null;
}
function codecLabel(name?: string, kind: "video" | "audio" = "video") {
  if (!name) return "Unknown";
  if (kind === "video") return ({ h264: "H.264 / AVC", hevc: "HEVC / H.265", av1: "AV1", vp9: "VP9", mpeg4: "MPEG-4" } as Record<string, string>)[name] || name.toUpperCase();
  return ({ aac: "AAC", opus: "Opus", mp3: "MP3", ac3: "Dolby Digital", eac3: "Dolby Digital Plus", flac: "FLAC" } as Record<string, string>)[name] || name.toUpperCase();
}
function qualityLabel(width: number, height: number) {
  const longEdge = Math.max(width, height);
  if (longEdge >= 2160) return "4K UHD";
  if (longEdge >= 1080) return "1080p Full HD";
  if (longEdge >= 720) return "720p HD";
  return "SD Low Res";
}
function bitrateKbps(value?: string) {
  const raw = Number(value);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw / 1000) : null;
}
function colorLabel(stream: ProbeStream) {
  const space = stream.color_space || "unknown";
  const transfer = stream.color_transfer || "unknown";
  const primaries = stream.color_primaries || "unknown";
  if (primaries === "bt2020" && transfer === "smpte2084") return "HDR10 (bt2020 / PQ)";
  if (primaries === "bt2020" && transfer === "arib-std-b67") return "HLG (bt2020)";
  if (space === "bt709" || primaries === "bt709") return "SDR (bt709)";
  return `Unspecified (${space})`;
}

export type MediaTelemetry = {
  resolution: string; qualityBadge: string; fps: number | null; videoBitrateKbps: number | null;
  videoCodec: string; audioCodec: string; audioBitrateKbps: number | null; colorSpace: string;
  durationSeconds: number | null; fileSizeMB: number | null;
};

export async function inspectMedia(inputPath: string, byteSize?: number, remote = false): Promise<MediaTelemetry> {
  const args = ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams"];
  if (remote) args.unshift("-protocol_whitelist", "file,http,https,tcp,tls,crypto");
  args.push(inputPath);
  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffprobePath, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] as const });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Media inspection timed out.")); }, 45_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; if (stdout.length > 4 * 1024 * 1024) { child.kill(); reject(new Error("ffprobe returned too much metadata.")); } });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-3000); });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("close", code => { clearTimeout(timeout); if (code === 0) resolve(stdout); else reject(new Error(stderr.trim() || "ffprobe could not read this media file.")); });
  });
  const data = JSON.parse(raw) as ProbeData;
  const video = data.streams?.find(stream => stream.codec_type === "video");
  const audio = data.streams?.find(stream => stream.codec_type === "audio");
  if (!video || !video.width || !video.height) throw new Error("No readable video stream was found.");
  const size = Number(data.format?.size) || byteSize || 0;
  const duration = Number(data.format?.duration);
  return {
    resolution: `${video.width}x${video.height}`,
    qualityBadge: qualityLabel(video.width, video.height),
    fps: rational(video.avg_frame_rate) ?? rational(video.r_frame_rate),
    videoBitrateKbps: bitrateKbps(video.bit_rate) ?? bitrateKbps(data.format?.bit_rate),
    videoCodec: codecLabel(video.codec_name),
    audioCodec: codecLabel(audio?.codec_name, "audio"),
    audioBitrateKbps: bitrateKbps(audio?.bit_rate),
    colorSpace: colorLabel(video),
    durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration * 100) / 100 : null,
    fileSizeMB: size > 0 ? Math.round((size / (1024 * 1024)) * 100) / 100 : null,
  };
}
