import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // GroupMe avatars.
    remotePatterns: [{ protocol: "https", hostname: "i.groupme.com" }],
  },
  // Dev only: lets a phone on the same network load the dev server
  // (http://<your Mac's IP>:3000). Lehigh Wi-Fi hands out 128.180.x.x.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "128.180.*.*"],
};

export default nextConfig;
