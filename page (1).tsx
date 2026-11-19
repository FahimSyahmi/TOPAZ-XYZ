import { auth } from "@/auth";
import { getDailyCredits } from "@/lib/credits";
import { redirect } from "next/navigation";
import { signOutUser } from "@/app/signin/actions";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");
  const account = await getDailyCredits(session.user.id);
  return <main className="site-shell grid min-h-screen place-items-center px-5 text-white"><section className="glass-panel w-full max-w-lg rounded-3xl p-7"><a href="/" className="text-sm text-[#ffd0e6]">← Back to Topaz.xyz</a><div className="mt-7 flex items-center gap-4">{session.user.image ? <img src={session.user.image} alt="" className="h-14 w-14 rounded-full border border-[#F472B6]/40 object-cover"/> : <div className="grid h-14 w-14 place-items-center rounded-full bg-[#F472B6]/15 text-xl text-[#ffd0e6]">{session.user.name?.[0] ?? "T"}</div>}<div><h1 className="text-2xl font-semibold">{session.user.name || "Your account"}</h1><p className="mt-1 text-sm text-[#999ba4]">{session.user.email}</p></div></div><div className="mt-7 rounded-2xl border border-[#F472B6]/20 bg-[#F472B6]/[.06] p-5"><p className="text-xs uppercase tracking-wider text-[#b8bac2]">Daily tokens</p><p className="mt-2 text-3xl font-semibold text-[#ffd0e6]">{account.tokens} <span className="text-base text-[#9a9ca5]">/ 50</span></p><p className="mt-2 text-xs text-[#858791]">Restores daily at 00:00 UTC.</p></div><form action={signOutUser} className="mt-6"><button className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-white hover:border-[#F472B6]/40">Sign out</button></form></section></main>;
}
