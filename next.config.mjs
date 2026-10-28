/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Prisma client is generated at build time (prisma generate runs first);
    // the two known "client not generated" errors only ever appear pre-generate.
    ignoreBuildErrors: false,
  },
  // Tester uploads (up to 10 MB plus multipart overhead) pass through proxy.ts, which buffers 10 MB by default.
  experimental: { proxyClientMaxBodySize: '12mb' },
  // The beta join link carries its token in ?k=; never send it on to other sites.
  async headers() {
    return [
      { source: '/b/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
      { source: '/api/tester/:path*', headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }] },
    ];
  },
  // claude.ai pages load platform libraries from /_runtime/ (e.g. mermaid); map them to a CDN.
  async rewrites() {
    return [{ source: '/_runtime/:file', destination: '/api/runtime/:file' }];
  },
};
export default nextConfig;
