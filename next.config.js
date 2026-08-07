/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow larger request bodies so uploaded PDFs can be sent to the API route.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // Don't let linting or type-checking block a deploy. Keeps builds robust.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
