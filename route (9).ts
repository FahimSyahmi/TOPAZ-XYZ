import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to check this prediction." }, { status: 401 });
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) return NextResponse.json({ error: "AI upscaling needs REPLICATE_API_TOKEN in .env.local." }, { status: 503 });
  const { id } = await context.params;
  if (!/^[a-z0-9_-]{8,80}$/i.test(id)) return NextResponse.json({ error: "Invalid prediction ID." }, { status: 400 });
  const owned = await prisma.aiPrediction.findFirst({ where: { id, userId: session.user.id } });
  if (!owned) return NextResponse.json({ error: "Prediction not found for this account." }, { status: 404 });
  try {
    const response = await fetch(`https://api.replicate.com/v1/predictions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { detail?: string; error?: string };
      return NextResponse.json({ error: body.detail || body.error || `Replicate returned HTTP ${response.status}.` }, { status: response.status });
    }
    const prediction = await response.json() as { status?: string; output?: unknown; error?: string | null; logs?: string };
    const output = prediction.output;
    const outputUrl = typeof output === "string" ? output : Array.isArray(output) ? output.find(item => typeof item === "string") : output && typeof output === "object" && "url" in output && typeof output.url === "string" ? output.url : null;
    const status = prediction.status || "starting";
    const progress = status === "succeeded" ? 100 : status === "processing" ? 60 : status === "starting" ? 10 : 0;
    return NextResponse.json({ status, progress, outputUrl, error: prediction.error || null });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : "Could not poll Replicate status." }, { status: 502 });
  }
}
