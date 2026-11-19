# Topaz.xyz

Topaz.xyz is a Next.js video enhancement prototype. It accepts MP4/MOV files up to 100 MB. Fast Optimize moves MP4 headers in the browser without re-encoding. FFmpeg Enhance uploads the file to the Next.js Node server to denoise, Lanczos-scale, sharpen, interpolate frames to 60/120 FPS, and encode H.264/AAC. AI Super-Resolution uploads to Replicate and runs the configured hosted video upscaling model on GPU; this is the mode that uses AI to generate higher-resolution detail. All methods can introduce tradeoffs, and no tool can guarantee that TikTok preserves quality after upload.

The technical inspector uploads the selected video to this app server for ffprobe analysis, then deletes its temporary file. FFmpeg jobs upload and temporarily store the source on this app server; job output expires after 30 minutes. AI jobs upload the video through the app server to Replicate, where the model processes it on hosted GPU infrastructure. Review Replicate's current model pricing and data-retention terms before use. The in-memory FFmpeg job registry expects a single long-running Node process and is not suitable for serverless multi-instance hosting.

## Run locally

Requirements: Node.js 20.9 or newer and npm. `ffmpeg-static` and `ffprobe-static` provide the local media tools. Copy `.env.example` to `.env.local`, then configure PostgreSQL and Auth.js before using sign-in. AI Super-Resolution also requires `REPLICATE_API_TOKEN`. Keep every secret server-side and never commit `.env.local`.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local URL printed by Next.js, usually `http://localhost:3000`.

Signed-in accounts have a server-stored 50-token daily balance. FFmpeg Lite uses one token; the standard FFmpeg profiles remain free. Tokens are associated with the OAuth account across browsers.

## Accounts and OAuth

Sign in with Google and/or Discord. On first sign-in, Auth.js creates a database user and the user row starts with 50 tokens. The balance resets to 50 at the next UTC day. FFmpeg Lite deducts one token on the server; if the FFmpeg job later fails, the status route refunds that token. The API routes require a signed-in account for processing and private job downloads.

1. Create a PostgreSQL database and set `DATABASE_URL` in `.env.local`.
2. Generate an Auth.js secret in PowerShell with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` and set it as `AUTH_SECRET`.
3. Create OAuth apps with these callback URLs (replace the origin with your domain for production):
   - Google: `https://YOUR_DOMAIN/api/auth/callback/google`
   - Discord: `https://YOUR_DOMAIN/api/auth/callback/discord`
   - Local development uses `http://localhost:3000/api/auth/callback/google` and `/api/auth/callback/discord`.
4. Set the provider client IDs/secrets (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`) in local and production environment settings.
5. Apply the included initial schema with `npm run db:migrate:dev` locally. Use `npm run db:migrate:deploy` in production.

OAuth providers only appear when their ID and secret are configured. Sign-in automatically creates the user's account. Set separate OAuth callback URLs for the production domain and localhost.

AI mode defaults to Replicate's `bytedance/video-upscaler`; `REPLICATE_MODEL_VERSION` can select another compatible model/version, but its input schema must support `video`, `target_resolution`, and `target_fps`. The app checks key presence but does not make a paid prediction automatically. Starting an AI job may incur Replicate charges.

## Topaz Engine API

The header-only patch endpoint and browser client library are documented in [docs/topaz-engine-api.md](docs/topaz-engine-api.md). The standalone client is available at `/topaz-engine-client.mjs`. Add rate limiting and abuse monitoring before exposing processing endpoints publicly.

## Hosting note

The FFmpeg queue and output files are currently held in the Next.js process memory and local temporary storage. This prototype therefore requires a single long-running Node host with writable temporary disk; it is not production-ready on stateless serverless functions or multiple instances. Before a public launch, move video files to private object storage and FFmpeg jobs to a durable worker/queue, then add per-user rate limits, upload cleanup, Terms of Service, and a Privacy Policy. Auth.js and PostgreSQL accounts are persistent, but the media job pipeline is still single-process.
