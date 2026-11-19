import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { signInWithProvider } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await auth();
  if (session?.user) redirect("/");
  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  const discordEnabled = Boolean(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET);

  return <main className="site-shell grid min-h-screen place-items-center px-5 text-white"><section className="glass-panel w-full max-w-md rounded-3xl p-7"><a href="/" className="text-sm text-[#ffd0e6]">← Back to Topaz.xyz</a><h1 className="mt-7 text-3xl font-semibold tracking-tight">Sign in</h1><p className="mt-2 text-sm text-[#a1a2aa]">Save your account and daily credits across devices.</p><div className="mt-7 space-y-3">{googleEnabled && <form action={signInWithProvider}><input type="hidden" name="provider" value="google"/><button className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-[#f2eaf0]">Continue with Google</button></form>}{discordEnabled && <form action={signInWithProvider}><input type="hidden" name="provider" value="discord"/><button className="w-full rounded-xl border border-[#5865F2]/40 bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white hover:bg-[#4752c4]">Continue with Discord</button></form>}{!googleEnabled && !discordEnabled && <p className="rounded-xl border border-amber-300/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">OAuth is not configured yet. Set the Google and/or Discord client ID and secret in your environment.</p>}</div><p className="mt-6 text-[10px] leading-5 text-[#81838d]">By signing in, you agree to use the service responsibly. Add your final Terms and Privacy Policy before public launch.</p></section></main>;
}
