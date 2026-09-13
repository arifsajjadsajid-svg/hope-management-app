/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['exceljs', 'bcryptjs'],
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Restoring a backup uploads the whole database as one file. The default
    // 1 MB ceiling is below even a small academy's export. 4 MB is the most
    // that fits under Vercel's own 4.5 MB request limit; larger databases are
    // restored with `npm run restore`, which does not go over HTTP at all.
    serverActions: { bodySizeLimit: '4mb' },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // Once the site is served over HTTPS, refuse to fall back to plain
          // HTTP. Only sent in production so local development still works.
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
