import { NextResponse } from "next/server";
import { getVideoJob, readVideoOutput } from "@/lib/video-jobs";
import { auth } from "@/auth";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to download this video." }, { status: 401 });
  const { id } = await context.params;
  const job = getVideoJob(id);
  if (!job || job.status !== "complete") return NextResponse.json({ error: "The optimized video is not ready." }, { status: 404 });
  if (job.userId !== session.user.id) return NextResponse.json({ error: "This job belongs to another account." }, { status: 403 });
  const video = await readVideoOutput(job);
  return new Response(new Uint8Array(video), { headers: { "Content-Type": "video/mp4", "Content-Length": String(video.byteLength), "Content-Disposition": 'attachment; filename="topaz-enhanced.mp4"', "Cache-Control": "no-store" } });
}
