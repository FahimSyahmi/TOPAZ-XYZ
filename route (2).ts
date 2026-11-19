import { auth } from "@/auth";
import { getDailyCredits } from "@/lib/credits";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in to access your account credits." }, { status: 401 });
  try {
    const account = await getDailyCredits(session.user.id);
    return NextResponse.json({ tokens: account.tokens, maximum: 50, resetsAt: nextUtcReset() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load credits." }, { status: 500 });
  }
}

function nextUtcReset() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}
