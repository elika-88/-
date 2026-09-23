import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser tests run alongside the user's development server with isolated output.
  ...(process.env.LUMINA_E2E === '1' ? { distDir: '.next-e2e' } : {}),
  poweredByHeader: false,
  devIndicators: false,
};

export default nextConfig;
