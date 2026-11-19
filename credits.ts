import { prisma } from "@/lib/prisma";

export const DAILY_CREDITS = 50;

function utcDayStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function getDailyCredits(userId: string) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { tokens: true, lastResetAt: true } });
    if (!user) throw new Error("Account was not found.");
    const today = utcDayStart();
    if (user.lastResetAt < today) {
      await tx.user.updateMany({ where: { id: userId, lastResetAt: user.lastResetAt }, data: { tokens: DAILY_CREDITS, lastResetAt: today } });
      const refreshed = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { tokens: true, lastResetAt: true } });
      return refreshed;
    }
    return user;
  });
}

export async function spendCredits(userId: string, amount: number) {
  if (!Number.isInteger(amount) || amount < 1 || amount > DAILY_CREDITS) throw new Error("Invalid credit amount.");
  await getDailyCredits(userId);
  const result = await prisma.user.updateMany({ where: { id: userId, tokens: { gte: amount } }, data: { tokens: { decrement: amount } } });
  if (result.count === 0) return { ok: false as const, tokens: (await getDailyCredits(userId)).tokens };
  return { ok: true as const, tokens: (await getDailyCredits(userId)).tokens };
}

export async function refundCredits(userId: string, amount: number) {
  await getDailyCredits(userId);
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { tokens: true } });
  if (!current) return;
  await prisma.user.update({ where: { id: userId }, data: { tokens: Math.min(DAILY_CREDITS, current.tokens + amount) } });
}
