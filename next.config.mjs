/** @type {import('next').NextConfig} */
const devDistDir = process.env.NODE_ENV === "development" ? ".next-dev" : ".next";

const nextConfig = {
  distDir: devDistDir,
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['better-sqlite3'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
