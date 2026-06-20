/** @type {import('next').NextConfig} */
const nextConfig = {
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
