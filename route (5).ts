import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { startVideoJob } from "@/lib/video-jobs";
import { refundCredits, spendCredits } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in before processing videos." }, { status: 401 });
  let charged = false;
  let charge = 0;
  try {
    const data = await request.formData();
    const file = data.get("video");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an MP4 or MOV video." }, { status: 400 });
    const extension = file.name.toLowerCase().split(".").pop();
    if (!(extension === "mp4" || extension === "mov")) return NextResponse.json({ error: "Only MP4 and MOV files are supported." }, { status: 415 });
    if (file.size === 0 || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Video must be between 1 byte and 100 MB." }, { status: 413 });
    const requestedFps = Number(data.get("fps"));
    const fps = ([24, 25, 30, 50, 60, 120].includes(requestedFps) ? requestedFps : 60) as 24 | 25 | 30 | 50 | 60 | 120;
    const maxDimension = data.get("resolution") === "4k" ? 3840 : 1920;
    const interpolate = data.get("interpolate") !== "false";
    const rawDuration = Number(data.get("duration"));
    const duration = Number.isFinite(rawDuration) ? Math.max(0, Math.min(rawDuration, 600)) : 0;
    charge = data.get("profile") === "lite" ? 1 : 0;
    if (charge) {
      const result = await spendCredits(session.user.id, charge);
      if (!result.ok) return NextResponse.json({ error: "Not enough tokens. Your daily tokens restore at midnight UTC.", tokens: result.tokens }, { status: 402 });
      charged = true;
    }
    const id = await startVideoJob({ name: file.name, bytes: await file.arrayBuffer(), fps, maxDimension, duration, interpolate, userId: session.user.id, creditCharge: charge });
    return NextResponse.json({ id }, { status: 202 });
  } catch (reason) {
    if (charged) await refundCredits(session.user.id, charge);
    const message = reason instanceof Error ? reason.message : "Could not start video processing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
