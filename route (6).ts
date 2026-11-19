import { NextResponse } from "next/server";
import { getVideoJob } from "@/lib/video-jobs";
import { auth } from "@/auth";
import { refundCredits } from "@/lib/credits";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to view this job." }, { status: 401 });
  const { id } = await context.params;
  const job = getVideoJob(id);
  if (!job) return NextResponse.json({ error: "This processing job expired. Please run it again." }, { status: 404 });
  if (job.userId !== session.user.id) return NextResponse.json({ error: "This job belongs to another account." }, { status: 403 });
  if (job.status === "failed" && job.creditCharge > 0 && !job.refunded) {
    job.refunded = true;
    await refundCredits(job.userId, job.creditCharge);
  }
  return NextResponse.json({ status: job.status, progress: job.progress, stage: job.stage, error: job.error });
}
