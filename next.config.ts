import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cache.willhaben.at',
      },
    ],
  },
};

export default nextConfig;