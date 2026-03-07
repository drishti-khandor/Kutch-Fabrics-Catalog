/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://backend:8000/api/:path*",
      },
      {
        source: "/images/:path*",
        destination: "http://backend:8000/images/:path*",
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "backend" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

module.exports = nextConfig;
