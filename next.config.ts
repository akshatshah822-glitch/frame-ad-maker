import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/video/assemble": ["node_modules/ffmpeg-static/ffmpeg", "node_modules/ffprobe-static/bin/linux/x64/ffprobe"],
  },
};

export default nextConfig;
