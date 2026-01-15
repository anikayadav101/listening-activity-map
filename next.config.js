/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  images: {
    unoptimized: true,
  },
  basePath: process.env.NODE_ENV === 'production' ? '/listening-activity-map' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/listening-activity-map' : '',
  typescript: {
    // Ignore type errors in scripts directory during build (scripts aren't part of the build)
    ignoreBuildErrors: true,
  },
  webpack: (config, { isServer }) => {
    // Exclude scripts from client-side bundle
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
      }
    }
    return config
  },
}

module.exports = nextConfig


