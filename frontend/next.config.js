/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
      {
        source: "/images/:path*",
        destination: `${BACKEND_URL}/images/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "backend" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "**.railway.app" },
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
  },
};

module.exports = nextConfig;
