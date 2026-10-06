import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Video samples use the same 200 MB cap as the videos bucket.
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
