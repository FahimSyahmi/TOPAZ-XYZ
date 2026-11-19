import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Topaz.xyz — Video Enhancer",
  description: "Resize, sharpen, and interpolate videos to 60 or 120 FPS with FFmpeg.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
