/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow larger request bodies so uploaded PDFs can be sent to the API route.
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = nextConfig;
