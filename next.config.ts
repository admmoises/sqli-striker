import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow LAN access during dev — HMR + RSC fetches refuse cross-origin
  // requests by default in Next 16. We're a single-operator local tool,
  // so opening these to common LAN ranges is fine.
  allowedDevOrigins: ["10.1.1.1", "localhost", "127.0.0.1"],
};

export default nextConfig;
