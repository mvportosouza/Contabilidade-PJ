/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Permite base64 grandes (logo embutida)
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
