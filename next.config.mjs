/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Prisma client is generated at build time (prisma generate runs first);
    // the two known "client not generated" errors only ever appear pre-generate.
    ignoreBuildErrors: false,
  },
  // claude.ai pages load platform libraries from /_runtime/ (e.g. mermaid); map them to a CDN.
  async rewrites() {
    return [{ source: '/_runtime/:file', destination: '/api/runtime/:file' }];
  },
};
export default nextConfig;
