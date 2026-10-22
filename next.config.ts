import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // GroupMe avatars.
    remotePatterns: [{ protocol: "https", hostname: "i.groupme.com" }],
  },
};

export default nextConfig;
