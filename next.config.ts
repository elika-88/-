import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser tests run alongside the user's development server with isolated output.
  ...(process.env.LUMINA_E2E === '1' ? { distDir: '.next-e2e' } : {}),
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    const headers = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
    ];
    return [{ source: '/admin/:path*', headers }, { source: '/api/admin/:path*', headers }];
  },
};

export default nextConfig;
