import type { NextConfig } from "next";
const nextConfig: NextConfig = { serverExternalPackages: ["ffmpeg-static", "@prisma/client"], experimental: { serverActions: { bodySizeLimit: "110mb" } } };
export default nextConfig;
