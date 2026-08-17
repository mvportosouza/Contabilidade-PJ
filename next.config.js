/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,

  // Permite base64 grandes (logo embutida)
  images: {
    unoptimized: true,
  },

  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Content-Type',
            value:
              'application/javascript; charset=utf-8',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
