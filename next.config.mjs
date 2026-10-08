/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // A full prefetch (the day view warms the days either side) stays usable for
  // 60 s, so switching days on the phone doesn't wait on the server (3 Oct 2026).
  experimental: { staleTimes: { dynamic: 0, static: 60 } },
  // Short links for posts (8 Oct 2026): a clean address in a bio or post that
  // lands on the home page tagged with where the visitor came from, so Clarity
  // can split visits by channel. Temporary (307), so a target can change later.
  async redirects() {
    return [
      { source: '/ig', destination: '/?utm_source=instagram', permanent: false },
      { source: '/reddit', destination: '/?utm_source=reddit', permanent: false },
      { source: '/beta', destination: '/?utm_source=betalist', permanent: false },
    ];
  },
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
