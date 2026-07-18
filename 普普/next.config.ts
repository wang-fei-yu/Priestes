import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // NOTE: output:'export' is only needed for Tauri static build (next build).
  // In dev mode it breaks API routes. Build scripts add it temporarily.
  // output: 'export',
  compress: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ['framer-motion', 'lucide-react'],
  },
  allowedDevOrigins: [
    'preview-chat-689cf2c0-5d11-414c-b3d7-aeaaba1b16c6.space-z.ai',
    '.space-z.ai',
  ],
};

export default nextConfig;
