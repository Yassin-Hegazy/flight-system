import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  // Forward /api/* to the NestJS API so the browser only ever talks to one origin.
  // Evaluated by `next dev`, `next build`, `next start` and `next typegen`, which all fail fast
  // if API_URL is missing.
  rewrites() {
    const apiUrl = process.env.API_URL;
    if (!apiUrl) {
      throw new Error('API_URL is not set. Copy apps/web/.env.example to apps/web/.env.');
    }
    return Promise.resolve([
      {
        source: '/api/:path*',
        destination: `${apiUrl.replace(/\/$/, '')}/:path*`,
      },
    ]);
  },
};

export default nextConfig;
