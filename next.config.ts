import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets colleagues on the office Wi-Fi open the dev server at http://<this Mac's 172.16.x.x IP>:3000,
  // and people outside the office through a temporary Cloudflare quick-tunnel link (https://….trycloudflare.com).
  allowedDevOrigins: ["172.16.*.*", "*.trycloudflare.com"],
  outputFileTracingIncludes: {
    "/api/video/assemble": ["node_modules/ffmpeg-static/ffmpeg", "node_modules/ffprobe-static/bin/linux/x64/ffprobe", "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"],
  },
};

export default nextConfig;
