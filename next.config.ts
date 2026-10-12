import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/question/pedagogy/render": ["public/pedagogy-logos/**", "public/pedagogy-backgrounds/**"],
    "/api/video/assemble": ["node_modules/ffmpeg-static/ffmpeg", "node_modules/ffprobe-static/bin/linux/x64/ffprobe", "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf"],
  },
};

export default nextConfig;
