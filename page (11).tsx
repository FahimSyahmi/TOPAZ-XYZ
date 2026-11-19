import Link from "next/link";

const code = `import { optimize } from "/topaz-engine-client.mjs";

const { blob, engine, changed } = await optimize(videoFile);
const url = URL.createObjectURL(blob);
downloadLink.href = url;`;

export default function ApiDocsPage() {
  return <main className="site-shell relative isolate min-h-screen overflow-hidden bg-[#070609] px-5 py-10 text-white md:px-8"><div aria-hidden="true" className="ambient-orb orb-one"/><div aria-hidden="true" className="ambient-orb orb-two"/>
    <div className="relative z-10 mx-auto max-w-4xl">
      <header className="mb-12 flex items-center justify-between border-b border-white/10 pb-5">
        <Link href="/" className="flex items-center gap-3"><img src="/logo.png" alt="Topaz logo" className="h-9 w-9 rounded-full"/><span className="font-semibold">Topaz<span className="text-[#F472B6]">.xyz</span></span></Link>
        <span className="text-xs text-[#9a9ca5]">Engine API v1</span>
      </header>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[.2em] text-[#F472B6]">Developer API</p>
      <h1 className="text-4xl font-semibold tracking-tight">Fast-start video plans</h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-[#a1a3ac]">Topaz reads MP4/MOV container headers and returns a byte-range plan. The browser assembles the result from the original file. Video and audio media data are not sent to this endpoint.</p>

      <section className="glass-panel glass-card mt-10 rounded-2xl p-5">
        <h2 className="text-base font-semibold">Endpoint</h2>
        <code className="mt-3 block rounded-lg bg-black/40 p-3 text-sm text-[#ffd0e6]">POST /api/topaz/patch</code>
        <p className="mt-3 text-xs leading-6 text-[#999ba4]">Accepts a unique requestId, the file layout, and base64 header bytes (up to 16 MB decoded). It returns a plan for moving the movie header before the media data when required.</p>
      </section>

      <section className="glass-panel glass-card mt-5 rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-base font-semibold">Browser client library</h2><a href="/topaz-engine-client.mjs" download className="text-xs font-medium text-[#ffd0e6] hover:text-white">Download module</a></div>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-[#09090c] p-4 text-xs leading-6 text-[#c7c9d0]"><code>{code}</code></pre>
        <p className="mt-3 text-xs leading-6 text-[#999ba4]">The standalone module has no runtime dependencies and exports <code className="text-[#ffd0e6]">prepare</code>, <code className="text-[#ffd0e6]">assemble</code>, and <code className="text-[#ffd0e6]">optimize</code>.</p>
      </section>

      <section className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-300/[.04] p-5">
        <h2 className="text-sm font-semibold text-amber-100">Prototype API access</h2>
        <p className="mt-2 text-xs leading-6 text-[#b7b2a6]">This endpoint currently has no API-key authentication, rate limiting, or paid run accounting. Keep it on localhost or add access controls before making the site public. Atom headers can contain camera/editor metadata such as device details or location.</p>
      </section>

      <p className="mt-8 text-xs text-[#777984]">This API only prepares container layout. Use the main app's FFmpeg mode for resizing, sharpening, frame interpolation, and re-encoding.</p>
      <Link href="/" className="mt-8 inline-flex rounded-lg border border-[#F472B6]/30 px-4 py-2 text-xs text-[#ffd0e6] hover:bg-[#F472B6]/[.06]">Back to Topaz</Link>
    </div>
  </main>;
}
