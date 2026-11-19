import { NextResponse } from "next/server";
import { createPatchPlan } from "@/lib/topaz-engine-plan";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload.requestId !== "string" || !/^[\w-]{8,80}$/.test(payload.requestId)) {
      return NextResponse.json({ error: "requestId must be 8–80 letters, numbers, underscores, or hyphens." }, { status: 400 });
    }
    const result = createPatchPlan(payload.layout, payload.header);
    return NextResponse.json({ requestId: payload.requestId, ...result, runsLeft: null, replay: false });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "The Topaz Engine could not process this video header.";
    return NextResponse.json({ error: message, code: "unsupported_layout" }, { status: 422 });
  }
}
