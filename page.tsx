"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, FileVideo2, Film, Gauge, Info, LoaderCircle, LockKeyhole, Sparkles, Upload, WandSparkles, X } from "lucide-react";
import { inspectVideoFile, VideoInspection } from "@/lib/mp4-local";

type Profile = "standard" | "pro" | "lite";
type ProcessingMode = "fast" | "enhance" | "ai_upscale";
type Stage = "upload" | "inspecting" | "optimizing" | "ready" | "failed";
type DetailedTelemetry = { resolution: string; qualityBadge: string; fps: number | null; videoBitrateKbps: number | null; videoCodec: string; audioCodec: string; audioBitrateKbps: number | null; colorSpace: string; durationSeconds: number | null; fileSizeMB: number | null };
const DAILY_CREDITS = 50;
const maxSize = 100 * 1024 * 1024;
function formatBytes(bytes: number) { return `${(bytes / (1024 * 1024)).toFixed(2)} MB`; }

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const inspectRun = useRef(0);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [outputUrl, setOutputUrl] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [inspection, setInspection] = useState<VideoInspection | null>(null);
  const [beforeTelemetry, setBeforeTelemetry] = useState<DetailedTelemetry | null>(null);
  const [afterTelemetry, setAfterTelemetry] = useState<DetailedTelemetry | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [scaleFactor, setScaleFactor] = useState<2 | 4>(2);
  const [targetFps, setTargetFps] = useState<30 | 60>(60);
  const [telemetryError, setTelemetryError] = useState("");
  const [resolution, setResolution] = useState("");
  const [clipDuration, setClipDuration] = useState(0);
  const [profile, setProfile] = useState<Profile>("standard");
  const [mode, setMode] = useState<ProcessingMode>("fast");
  const [credits, setCredits] = useState<number | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const [resultNote, setResultNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [modal, setModal] = useState<"how" | "share" | null>(null);

  useEffect(() => { void fetch("/api/credits", { cache: "no-store" }).then(async response => { const data = await response.json(); if (response.ok) { setCredits(data.tokens); setSignedIn(true); } else { setCredits(null); setSignedIn(false); } }).catch(() => { setCredits(null); setSignedIn(false); }); }, []);
  useEffect(() => { void fetch("/api/upscale/ai", { cache: "no-store" }).then(response => response.json()).then(data => setAiConfigured(Boolean(data.configured))).catch(() => setAiConfigured(false)); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { if (outputUrl) URL.revokeObjectURL(outputUrl); }, [outputUrl]);

  const chooseFile = (candidate?: File) => {
    if (!candidate) return;
    setError("");
    const ext = candidate.name.toLowerCase().split(".").pop();
    if (!(["mp4", "mov"].includes(ext || "") || ["video/mp4", "video/quicktime"].includes(candidate.type))) {
      setError("Choose an MP4 or MOV video."); return;
    }
    if (candidate.size > maxSize) { setError("Your video must be 100 MB or smaller."); return; }
    if (preview) URL.revokeObjectURL(preview);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    if (inputRef.current) inputRef.current.value = "";
    setFile(candidate);
    setPreview(URL.createObjectURL(candidate));
    setOutputUrl("");
    setDownloadUrl("");
    setInspection(null);
    setBeforeTelemetry(null); setAfterTelemetry(null); setTelemetryError("");
    setResolution("");
    setClipDuration(0);
    setResultNote("");
    setProgress(0);
    setStage("inspecting");
    const run = ++inspectRun.current;
    void inspectVideoFile(candidate).then(info => {
      if (run === inspectRun.current) { setInspection(info); setStage("upload"); }
    }).catch(reason => {
      if (run === inspectRun.current) { setError(reason instanceof Error ? reason.message : "This video could not be inspected."); setStage("failed"); }
    });
    const form = new FormData(); form.append("video", candidate);
    void fetch("/api/inspect", { method: "POST", body: form }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not read video telemetry."); if (run === inspectRun.current) setBeforeTelemetry(data as DetailedTelemetry); }).catch(reason => { if (run === inspectRun.current) setTelemetryError(reason instanceof Error ? reason.message : "Video telemetry is unavailable."); });
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0]);
  const handleDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); };

  async function optimizeVideo() {
    if (!file || stage === "optimizing") return;
    if (!signedIn && mode !== "fast") { setError("Sign in with Google or Discord to process videos."); return; }
    const cost = mode === "enhance" && profile === "lite" ? 1 : 0;
    if (cost > 0 && credits !== null && credits < cost) { setError("You’re out of Lite credits for today. Your 50 credits reset at midnight UTC."); return; }
    setError("");
    setProgress(0);
    setStage("optimizing");
    try {
      if (mode === "fast") {
        setStatusText("Reading MP4 header on this device…");
        setProgress(16);
        const clientUrl = new URL("/topaz-engine-client.mjs", window.location.origin).href;
        const client = await import(/* webpackIgnore: true */ clientUrl) as { optimize: (input: File) => Promise<{ blob: Blob; engine: string; changed: boolean }> };
        setStatusText("Applying the Topaz fast-start plan…");
        setProgress(58);
        const result = await client.optimize(file);
        const blobUrl = URL.createObjectURL(result.blob);
        setOutputUrl(blobUrl);
        setDownloadUrl(blobUrl);
        setAfterTelemetry(beforeTelemetry);
        setResultNote(result.changed ? "Moved the MP4 movie header before video data for faster playback startup. The video and audio were not re-encoded." : "This file was already in fast-start order. The original video and audio were preserved without re-encoding.");
        setProgress(100);
        setStage("ready");
        return;
      }
      if (mode === "ai_upscale") {
        setStatusText("Uploading video to Replicate for GPU upscaling…");
        const form = new FormData(); form.append("video", file); form.append("scaleFactor", String(scaleFactor)); form.append("targetFps", String(targetFps));
        if (resolution) { const [width, height] = resolution.split(" × ").map(Number); form.append("sourceWidth", String(width)); form.append("sourceHeight", String(height)); }
        const startedResponse = await fetch("/api/upscale/ai", { method: "POST", body: form });
        const started = await startedResponse.json();
        if (!startedResponse.ok) throw new Error(started.error || "Could not start AI upscaling.");
        const deadline = Date.now() + 30 * 60 * 1000;
        while (Date.now() < deadline) {
          const response = await fetch(`/api/upscale/ai/${started.predictionId}`, { cache: "no-store" });
          const status = await response.json();
          if (!response.ok) throw new Error(status.error || "Could not read AI processing status.");
          setStatusText(status.status === "starting" ? "Waiting for a Replicate GPU…" : status.status === "processing" ? "AI upscaling video frames…" : "AI upscale complete; inspecting result…");
          setProgress(Math.max(8, Math.min(94, status.progress || 10)));
          if (status.status === "failed" || status.status === "canceled") throw new Error(status.error || "The Replicate prediction failed.");
          if (status.status === "succeeded") {
            if (!status.outputUrl) throw new Error("Replicate finished without returning a video URL.");
            setOutputUrl(status.outputUrl);
            setDownloadUrl(`/api/upscale/ai/${started.predictionId}/download`);
            setResultNote(`Replicate AI upscaling finished at ${started.targetResolution || "the selected resolution"}. Review detail, motion and audio before downloading.`);
            const telemetryResponse = await fetch("/api/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoUrl: status.outputUrl }) });
            const telemetry = await telemetryResponse.json();
            if (telemetryResponse.ok) setAfterTelemetry(telemetry as DetailedTelemetry); else setTelemetryError(telemetry.error || "Output telemetry is unavailable.");
            setProgress(100); setStage("ready"); return;
          }
          await new Promise(resolve => window.setTimeout(resolve, 2500));
        }
        throw new Error("AI processing is taking longer than expected. Check the prediction in Replicate and retry later.");
      }
      setStatusText("Uploading to your Topaz server…");
      const settings = profile === "pro" ? { fps: 120, resolution: "4k" } : profile === "lite" ? { fps: 120, resolution: "1080p" } : { fps: 60, resolution: "1080p" };
      const form = new FormData();
      form.append("video", file);
      form.append("fps", String(settings.fps));
      form.append("resolution", settings.resolution);
      form.append("duration", String(clipDuration));
      form.append("profile", profile);
      const jobId = await new Promise<string>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", "/api/process");
        request.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 18)); };
        request.onerror = () => reject(new Error("Upload interrupted. Check your connection and retry."));
        request.onload = () => {
          const payload = JSON.parse(request.responseText || "{}");
          if (request.status < 200 || request.status >= 300) reject(new Error(payload.error || "Could not start processing."));
          else resolve(payload.id);
        };
        request.send(form);
      });
      let done = false;
      const deadline = Date.now() + 15 * 60 * 1000;
      while (!done && Date.now() < deadline) {
        const response = await fetch(`/api/status/${jobId}`, { cache: "no-store" });
        const status = await response.json();
        if (!response.ok) throw new Error(status.error || "Could not read processing status.");
        setStatusText(status.stage || "Processing your video…");
        setProgress(18 + Math.round((status.progress || 0) * 0.82));
        if (status.status === "failed") throw new Error(status.error || "Video processing failed.");
        if (status.status === "complete") {
          setOutputUrl(`/api/download/${jobId}`);
          setDownloadUrl(`/api/download/${jobId}`);
          setResultNote(`FFmpeg created ${settings.fps} FPS output with Lanczos resizing and light sharpening. Interpolated frames are synthetic; inspect the result before posting.`);
          setProgress(100);
          done = true;
        } else await new Promise(resolve => window.setTimeout(resolve, 1000));
      }
      if (!done) throw new Error("Processing took too long. Please try a shorter clip or a smaller output size.");
      const telemetryResponse = await fetch("/api/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
      const telemetry = await telemetryResponse.json();
      if (telemetryResponse.ok) setAfterTelemetry(telemetry as DetailedTelemetry); else setTelemetryError(telemetry.error || "Output telemetry is unavailable.");
      const creditsResponse = await fetch("/api/credits", { cache: "no-store" });
      if (creditsResponse.ok) { const creditData = await creditsResponse.json(); setCredits(creditData.tokens); }
      setStage("ready");
    } catch (reason) {
      if (signedIn) void fetch("/api/credits", { cache: "no-store" }).then(response => response.json()).then(data => { if (Number.isInteger(data.tokens)) setCredits(data.tokens); });
      setError(reason instanceof Error ? reason.message : "Local MP4 optimization failed.");
      setStage("failed");
    }
  }

  const working = stage === "inspecting" || stage === "optimizing";
  const downloadName = mode === "fast" && file?.name.toLowerCase().endsWith(".mov") ? "topaz-faststart.mov" : mode === "fast" ? "topaz-faststart.mp4" : mode === "ai_upscale" ? "topaz-ai-upscaled.mp4" : "topaz-enhanced.mp4";
  const profileCards: { id: Profile; title: string; description: string; note: string }[] = [
    { id: "standard", title: "Smooth 1080p · 60 FPS", description: "Resize and sharpen, with motion-compensated frame interpolation to 60 FPS.", note: "Free · 1080p maximum dimension" },
    { id: "pro", title: "Smooth 4K · 120 FPS", description: "Higher output size and frame rate. Processing can take longer.", note: "Free · up to 4K and 120 FPS" },
    { id: "lite", title: "Smooth 1080p · 120 FPS", description: "A smaller output with generated intermediate frames.", note: "1 free credit · 50 daily" },
  ];

  return <main id="top" className="site-shell relative isolate min-h-screen overflow-hidden bg-[#070609] text-white"><div aria-hidden="true" className="ambient-orb orb-one"/><div aria-hidden="true" className="ambient-orb orb-two"/><div aria-hidden="true" className="ambient-orb orb-three"/>
    <header className="glass-nav sticky top-0 z-20 border-b border-white/[.07]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 md:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label="Topaz home"><img src="/logo.png" alt="Topaz logo" className="logo-ring h-10 w-10 rounded-full border border-[#F472B6]/50 object-cover transition-transform duration-500 hover:rotate-6"/><span className="text-base font-semibold tracking-tight">Topaz<span className="text-[#F472B6]">.xyz</span></span></a>
        <button onClick={() => setModal("how")} className="text-[11px] text-[#b8bac2] transition hover:text-[#F472B6] sm:text-sm">How It Works</button>
        <a href={signedIn ? "/account" : "/signin"} title="50 credits per account, restored daily at 00:00 UTC" className="rounded-full border border-[#F472B6]/25 bg-[#F472B6]/[.08] px-3.5 py-2 text-xs font-medium text-[#ffd0e6] shadow-[0_0_22px_rgba(244,114,182,.08)]">{signedIn ? `Tokens: ${credits ?? 50} / 50` : "Sign in · 50 daily tokens"}</a>
      </div>
    </header>

    <section className="relative z-10 mx-auto grid max-w-6xl gap-10 px-5 py-12 md:px-8 lg:grid-cols-[.9fr_1.1fr] lg:gap-14 lg:py-20">
      <div className="rise-in flex flex-col justify-center">
        <div className="mb-5 flex w-fit items-center gap-2 rounded-full border border-[#F472B6]/20 bg-[#F472B6]/[.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-[#ffd0e6]"><Sparkles size={12}/> Fast optimize + FFmpeg enhance</div>
        <h1 className="max-w-xl text-[clamp(3rem,6vw,5rem)] font-semibold leading-[.98] tracking-[-.06em]">Keep your<br/>video <span className="pink-gradient">crisp.</span></h1>
        <p className="mt-6 max-w-lg text-sm leading-7 text-[#a1a2aa]">Choose instant header optimization, CPU-based FFmpeg enhancement, or hosted GPU AI upscaling.</p>
        <div className="mt-8 flex flex-wrap gap-4 text-xs text-[#b5b7be]"><span className="flex items-center gap-2"><Gauge size={14} className="text-[#F472B6]"/> Fast mode stays at source FPS</span><span className="flex items-center gap-2"><Film size={14} className="text-[#F472B6]"/> Enhancement: 60 / 120 FPS</span><span className="flex items-center gap-2"><LockKeyhole size={14} className="text-[#F472B6]"/> Choose your processing mode</span></div>
        <p className="mt-10 max-w-lg border-l-2 border-[#F472B6]/50 pl-4 text-xs leading-6 text-[#81838d]">FFmpeg can resize and sharpen but does not synthesize missing detail. AI mode uses Replicate GPU inference to upscale video frames and may incur model charges.</p>
      </div>

      <div className="glass-panel glass-card rise-in delay-one relative z-10 rounded-3xl p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2.5 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded-xl bg-[#F472B6]/[.1] text-[#F472B6]"><WandSparkles size={16}/></span>Video optimizer</div><button disabled={working} onClick={() => { inspectRun.current += 1; setFile(null); setPreview(""); setOutputUrl(""); setInspection(null); setBeforeTelemetry(null); setAfterTelemetry(null); setTelemetryError(""); setResolution(""); setError(""); setStage("upload"); setProgress(0); }} className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#9a9ba4] hover:border-[#F472B6]/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">New project</button></div>

        {!file ? <div onClick={() => inputRef.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop} className={`upload-zone group relative flex min-h-[230px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 text-center transition ${dragging ? "border-[#F472B6] bg-[#F472B6]/[.06]" : "border-white/15 bg-[#0d0d10] hover:border-[#F472B6]/60"}`}>
          <input ref={inputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" onChange={handleInput} className="hidden"/><span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-[#F472B6]/25 bg-[#F472B6]/[.07] text-[#F472B6] transition group-hover:scale-105"><Upload size={21}/></span><p className="text-sm font-medium">Drop an MP4 or MOV here, or <span className="text-[#F472B6]">browse</span></p><p className="mt-2 text-xs text-[#7d7f89]">Up to 100 MB · File is read in your browser</p>
        </div> : <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0e]">
          <div className="relative"><span className="absolute left-3 top-3 z-10 rounded-md bg-black/70 px-2 py-1 text-[10px] text-white">Original preview</span><video src={preview} controls playsInline onLoadedMetadata={event => { const video = event.currentTarget; setResolution(video.videoWidth && video.videoHeight ? `${video.videoWidth} × ${video.videoHeight}` : "Unavailable"); setClipDuration(Number.isFinite(video.duration) ? video.duration : 0); }} className="aspect-video max-h-[260px] w-full bg-black object-contain"/></div>
          <div className="flex items-center gap-3 border-t border-white/[.08] p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#F472B6]/[.08] text-[#F472B6]"><FileVideo2 size={16}/></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{file.name}</p><p className="mt-1 text-[10px] text-[#858791]">{formatBytes(file.size)} · {resolution || "Reading resolution…"} · {inspection?.estimatedFps ? `~${inspection.estimatedFps.toFixed(2)} FPS` : "FPS estimate unavailable"}</p></div><button disabled={working} onClick={() => { inspectRun.current += 1; setFile(null); setPreview(""); setOutputUrl(""); setInspection(null); setStage("upload"); setError(""); if (inputRef.current) inputRef.current.value = ""; }} aria-label="Remove video" className="grid h-8 w-8 place-items-center rounded-lg text-[#8d8f98] hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"><X size={15}/></button></div>
        </div>}

        {error && <div role="alert" className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/[.08] px-3 py-2.5 text-xs leading-5 text-rose-200">{error}</div>}
        <div className="mt-5"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#9698a2]">Processing mode</span><span className="flex items-center gap-1 text-[9px] text-[#747680]"><Info size={11}/> Fast is closest to Haze’s header-only flow</span></div><div className="grid gap-2 sm:grid-cols-2"><button disabled={working} onClick={() => setMode("fast")} aria-pressed={mode === "fast"} className={`profile-card rounded-xl border p-3 text-left transition ${mode === "fast" ? "border-[#F472B6]/60 bg-[#F472B6]/[.09]" : "border-white/[.09] bg-[#101014] hover:border-white/20"}`}><span className="block text-xs font-semibold text-[#ffd0e6]">Fast Optimize · Free</span><span className="mt-2 block text-[10px] leading-4 text-[#9a9ca5]">Header-only API plan; video data stays in your browser. Usually finishes in seconds.</span></button><button disabled={working} onClick={() => setMode("enhance")} aria-pressed={mode === "enhance"} className={`profile-card rounded-xl border p-3 text-left transition ${mode === "enhance" ? "border-[#F472B6]/60 bg-[#F472B6]/[.09]" : "border-white/[.09] bg-[#101014] hover:border-white/20"}`}><span className="block text-xs font-semibold text-white">FFmpeg Enhance</span><span className="mt-2 block text-[10px] leading-4 text-[#9a9ca5]">Re-encodes the full clip to resize and generate smoother 60/120 FPS output. Slower.</span></button></div></div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3"><button disabled={working} onClick={() => setMode("ai_upscale")} aria-pressed={mode === "ai_upscale"} className={`profile-card rounded-xl border p-3 text-left transition ${mode === "ai_upscale" ? "border-[#F472B6]/60 bg-[#F472B6]/[.09]" : "border-white/[.09] bg-[#101014] hover:border-white/20"}`}><span className="block text-xs font-semibold text-white">AI Super-Resolution · GPU</span><span className="mt-2 block text-[10px] leading-4 text-[#9a9ca5]">Real AI video upscaling using Replicate’s hosted GPU. Uploads your full clip externally.</span><span className="mt-2 inline-flex rounded-full border border-[#F472B6]/25 px-2 py-0.5 text-[9px] text-[#ffd0e6]">{aiConfigured === null ? "Checking key…" : aiConfigured ? "Replicate key ready" : "Requires API Key"}</span></button></div>
        {mode === "ai_upscale" && <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-[10px] uppercase tracking-wider text-[#9698a2]">AI scale<select value={scaleFactor} onChange={event => setScaleFactor(Number(event.target.value) as 2 | 4)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101014] p-2.5 text-sm normal-case text-white"><option value="2">2× upscale</option><option value="4">4× upscale</option></select></label><label className="text-[10px] uppercase tracking-wider text-[#9698a2]">Target FPS<select value={targetFps} onChange={event => setTargetFps(Number(event.target.value) as 30 | 60)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#101014] p-2.5 text-sm normal-case text-white"><option value="30">30 FPS</option><option value="60">60 FPS</option></select></label><p className="col-span-2 text-[10px] leading-4 text-[#b6a8b3]">Replicate processes and stores this upload. GPU usage may be billed to your Replicate account; check that model’s current pricing before starting.</p></div>}
        {mode === "enhance" && <div className="mt-5"><div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#9698a2]">Enhancement profile</span><span className="flex items-center gap-1 text-[9px] text-[#747680]"><Info size={11}/> Generates frames; inspect for artifacts</span></div><div className="grid gap-2 sm:grid-cols-3">{profileCards.map(card => <button key={card.id} disabled={working} onClick={() => setProfile(card.id)} aria-pressed={profile === card.id} className={`profile-card rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${profile === card.id ? "border-[#F472B6]/60 bg-[#F472B6]/[.08]" : "border-white/[.09] bg-[#101014] hover:border-white/20"}`}><span className={`block text-xs font-semibold ${profile === card.id ? "text-[#ffd0e6]" : "text-white"}`}>{card.title}</span><span className="mt-2 block min-h-10 text-[10px] leading-4 text-[#9a9ca5]">{card.description}</span><span className="mt-2 block text-[9px] text-[#F472B6]">{card.note}</span></button>)}</div></div>}

        {stage === "optimizing" && <div className="mt-5 glass-panel rounded-xl p-4"><div className="mb-3 flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 text-white"><LoaderCircle size={14} className="shrink-0 animate-spin text-[#F472B6]"/>{statusText || "Preparing your video…"}</span><span className="text-[#9a9ca5]">{progress}%</span></div><div className="progress-track h-2 overflow-hidden rounded-full"><div className="progress-fill h-full rounded-full" style={{ width: `${progress}%` }}/></div><p className="mt-2 text-[10px] text-[#787a84]">{mode === "fast" ? "Sending only the small container header; your video stays in the browser." : mode === "ai_upscale" ? "Keep this tab open while the video uploads to Replicate and its GPU processes the frames." : "Keep this tab open while the full video is uploaded and re-encoded."}</p></div>}

        {stage === "ready" && outputUrl && <div className="mt-5 rounded-2xl border border-[#F472B6]/20 bg-[#F472B6]/[.04] p-3"><div className="relative"><span className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[10px] text-[#ffd0e6]"><Check size={12}/> Ready</span><video src={outputUrl} controls playsInline className="aspect-video max-h-[220px] w-full rounded-lg bg-black object-contain"/></div><p className="mt-3 text-[10px] leading-5 text-[#a6a8b1]">{resultNote}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><a href={downloadUrl || outputUrl} download={downloadName} className="flex items-center justify-center gap-2 rounded-xl bg-[#F472B6] px-4 py-3 text-xs font-bold text-[#170b14] transition hover:bg-[#ffadd5]"><ArrowDownToLine size={15}/>{mode === "fast" ? "Download Fast-Optimized Video" : mode === "ai_upscale" ? "Download AI-Upscaled MP4" : "Download Enhanced MP4"}</a><button onClick={() => setModal("share")} className="rounded-xl border border-[#F472B6]/30 px-4 py-3 text-xs font-semibold text-[#ffd0e6] hover:bg-[#F472B6]/[.07]">Direct Share Checklist</button></div><p className="mt-3 text-[9px] leading-4 text-[#777984]">{mode === "fast" ? "Original frames, audio, resolution, and FPS are preserved. Platforms may still recompress uploads." : "The file was processed. AI reconstruction and generated frames can introduce artifacts; compare the result with your original before posting."}</p></div>}
        {(beforeTelemetry || afterTelemetry) && <section className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold">Video quality inspector</h3><span className="text-[9px] text-[#9698a2]">ffprobe telemetry</span></div><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><span className="text-[#8f919b]">Spec</span><span className="text-[#8f919b]">Before</span><span className="text-[#8f919b]">After</span>{([["Resolution", beforeTelemetry?.resolution, afterTelemetry?.resolution], ["FPS", beforeTelemetry?.fps ?? "—", afterTelemetry?.fps ?? "—"], ["Video bitrate", beforeTelemetry?.videoBitrateKbps ? `${beforeTelemetry.videoBitrateKbps} kbps` : "—", afterTelemetry?.videoBitrateKbps ? `${afterTelemetry.videoBitrateKbps} kbps` : "—"], ["Codec", beforeTelemetry?.videoCodec, afterTelemetry?.videoCodec], ["Quality", beforeTelemetry?.qualityBadge, afterTelemetry?.qualityBadge]] as const).map(row => <><span key={`${row[0]}-label`} className="text-[#858791]">{row[0]}</span><span key={`${row[0]}-before`} className="break-words">{row[1] || "—"}</span><span key={`${row[0]}-after`} className="break-words">{row[2] || "Pending"}</span></>)}</div>{telemetryError && <p className="mt-2 text-[9px] text-amber-200">{telemetryError}</p>}</section>}

        <div className="mt-5 flex flex-col gap-3"><button onClick={stage === "ready" ? () => { setFile(null); setPreview(""); setOutputUrl(""); setInspection(null); setBeforeTelemetry(null); setAfterTelemetry(null); setResolution(""); setStage("upload"); if (inputRef.current) inputRef.current.value = ""; } : optimizeVideo} disabled={(!file && stage !== "ready") || working || (mode === "enhance" && profile === "lite" && credits === 0) || (mode === "ai_upscale" && aiConfigured === false)} className="action-button flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-[#170b14] disabled:cursor-not-allowed disabled:bg-[#31343a] disabled:text-[#858791] disabled:shadow-none">{working ? <><LoaderCircle size={16} className="animate-spin"/>{mode === "fast" ? "Fast optimizing…" : mode === "ai_upscale" ? "AI upscaling…" : "Enhancing your video…"}</> : stage === "failed" ? <>Retry {mode === "fast" ? "Fast Optimize" : mode === "ai_upscale" ? "AI Upscale" : "Enhancement"} <ArrowRight size={15}/></> : stage === "ready" ? <>Process Another Video <ArrowRight size={15}/></> : mode === "fast" ? <>Fast Optimize · Free <ArrowRight size={15}/></> : mode === "ai_upscale" ? <>AI Upscale · Replicate GPU <ArrowRight size={15}/></> : <>Enhance Video · {profile === "lite" ? "1 token" : "Free"} <ArrowRight size={15}/></>}</button><div className="flex items-center justify-center gap-2 text-[10px] text-[#82848e]"><LockKeyhole size={12} className="text-[#F472B6]"/>{mode === "fast" ? "Header only · video stays in your browser" : mode === "ai_upscale" ? "Upload to Replicate GPU · billed per model pricing" : "Full video uploads to this app server"}<span className="text-white/20">·</span>{signedIn ? `${credits ?? DAILY_CREDITS} tokens` : "Sign in required"}</div></div>
      </div>
    </section>

    <section className="relative z-10 border-t border-white/[.07] bg-transparent px-5 py-16 md:px-8"><div className="mx-auto max-w-6xl"><div className="mb-8"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#F472B6]">Built for a clean handoff</p><h2 className="text-2xl font-semibold tracking-tight">Resize, sharpen, and smooth.</h2></div><div className="grid gap-3 md:grid-cols-3">{[{ icon: FileVideo2, title: "FFmpeg re-encoding", desc: "Exports an H.264 MP4 with AAC audio, fast-start playback, and a high-quality CRF setting." }, { icon: Gauge, title: "Motion interpolation", desc: "FFmpeg estimates in-between frames to create 60 or 120 FPS output. Inspect for motion artifacts." }, { icon: Sparkles, title: "Resize and sharpen", desc: "Lanczos scaling and light sharpening can improve presentation, but cannot recover details missing from a low-resolution source." }].map(item => <article key={item.title} className="glass-panel glass-card rise-in rounded-2xl p-5"><span className="mb-5 grid h-10 w-10 place-items-center rounded-xl bg-[#F472B6]/[.08] text-[#F472B6]"><item.icon size={17}/></span><h3 className="text-sm font-semibold">{item.title}</h3><p className="mt-2 text-xs leading-5 text-[#999ba4]">{item.desc}</p></article>)}</div></div></section>

    <section id="faq" className="relative z-10 mx-auto max-w-4xl px-5 py-16 md:px-8"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.18em] text-[#F472B6]">Good to know</p><h2 className="mb-7 text-2xl font-semibold">Frequently asked questions</h2><div className="space-y-2">{[
      ["Can this restore detail in a blurry, low-quality video?", "It resizes with Lanczos and applies light sharpening. This is not AI super-resolution, so it cannot reliably reconstruct detail that is not present in the source."],
      ["How does 120 FPS mode work?", "FFmpeg's motion-compensated interpolation estimates new in-between frames. It can look smoother, but fast or complex motion may show warping or ghosting. Compare the output before posting."],
      ["Does it use HandBrake?", "No. It uses FFmpeg, another video transcoding tool, with similar H.264 encoding and scaling controls. It re-encodes the video and audio."],
      ["Does this bypass TikTok compression?", "No tool can guarantee that. TikTok decides how it processes and serves each upload. Uploading a clean export through TikTok Studio may help avoid extra edits in the mobile app."],
      ["Where is my video processed?", "The selected video is uploaded to the Next.js server running this app. Temporary input/output files are removed after the job finishes or expires. On a public deployment, the operator hosting that server can access uploads while they are being processed."],
      ["Why is processing slow?", "Motion-compensated frame interpolation is CPU intensive, especially for 4K and 120 FPS. Shorter clips and 1080p output finish sooner."],
    ].map(([question, answer]) => <details key={question} className="faq-card group rounded-xl border border-white/[.08] px-4 py-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-xs font-medium text-white">{question}<ChevronDown size={14} className="shrink-0 text-[#F472B6] transition group-open:rotate-180"/></summary><p className="pt-3 text-xs leading-5 text-[#a1a3ac]">{answer}</p></details>)}</div></section>

    <footer className="relative z-10 border-t border-white/[.07] px-5 py-6 text-center text-[10px] text-[#85808a]"><span>© 2026 Topaz.xyz</span><span className="px-2">·</span><a href="/api-docs" className="hover:text-[#ffd0e6]">Engine API</a><span className="px-2">·</span><span>Not affiliated with TikTok</span></footer>

    {modal && <div className="modal-backdrop fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md" onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}><section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal-glass w-full max-w-lg rounded-2xl border border-white/10 p-5"><div className="mb-4 flex items-center justify-between"><h2 id="dialog-title" className="text-base font-semibold">{modal === "how" ? "How Topaz works" : "Direct Share Checklist"}</h2><button onClick={() => setModal(null)} aria-label="Close dialog" className="grid h-8 w-8 place-items-center rounded-lg text-[#9a9ca5] hover:bg-white/10 hover:text-white"><X size={16}/></button></div>{modal === "how" ? <div className="space-y-3 text-xs leading-6 text-[#a1a3ac]"><p>Fast Optimize reads the MP4/MOV header in your browser and sends only that header to the Topaz Engine API. The video and audio data stay in your browser; no re-encoding occurs.</p><p>FFmpeg Enhance uploads the full file to this app's server, then denoises, resizes, sharpens, interpolates frames, and encodes a new MP4. This is conventional processing, not an AI detail-reconstruction model.</p><p>AI Super-Resolution sends the video through this app server to Replicate for hosted GPU inference. This may incur charges on your Replicate account and requires a server-side API token.</p><p>Temporary FFmpeg job files are deleted after processing or expiry. Platforms may still recompress any result.</p></div> : <div className="space-y-3 text-xs text-[#c3c5cc]"><label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-[#F472B6]"/>Preview the video and check for interpolation artifacts.</label><label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-[#F472B6]"/>Upload from a desktop browser or the platform’s creator studio.</label><label className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 accent-[#F472B6]"/>Keep the original video as a backup.</label><p className="border-t border-white/10 pt-3 leading-5 text-[#858791]">The receiving platform may still compress uploads.</p></div>}</section></div>}
  </main>;
}
