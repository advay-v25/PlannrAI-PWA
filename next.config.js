/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        domains: [],
    },
    experimental: {
        serverActions: {
            bodySizeLimit: "2mb",
        },
    },
    // Enable Turbopack with empty config for Next.js 16
    turbopack: {},
    // PWA will be handled via service worker registration in app code
    eslint: {
        ignoreDuringBuilds: true,
    },
};

module.exports = nextConfig;
