/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: {
    // Prisma client is generated at build time (prisma generate runs first);
    // the two known "client not generated" errors only ever appear pre-generate.
    ignoreBuildErrors: false,
  },
};
export default nextConfig;
