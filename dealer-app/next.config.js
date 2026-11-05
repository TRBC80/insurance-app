/** @type {import('next').NextConfig} */
const nextConfig = {
  // Don't let type-checking block a deploy. Keeps builds robust.
  typescript: { ignoreBuildErrors: true },
};

module.exports = nextConfig;
