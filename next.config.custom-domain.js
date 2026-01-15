/** @type {import('next').NextConfig} */
// Use this config when you have a custom domain (no basePath needed)
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  // No basePath for custom domain
  basePath: '',
  assetPrefix: '',
}

module.exports = nextConfig

