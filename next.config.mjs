/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // A full prefetch (the day view warms the days either side) stays usable for
  // 60 s, so switching days on the phone doesn't wait on the server (3 Oct 2026).
  experimental: { staleTimes: { dynamic: 0, static: 60 } },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
