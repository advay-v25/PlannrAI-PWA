/** @type {import('next').NextConfig} */

const nextConfig = {
    compress: true,
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
    typescript: {
        ignoreBuildErrors: true,
    },
    async redirects() {
        return [
            {
                source: '/app/home',
                destination: '/app',
                permanent: true,
            },
        ];
    },
};

module.exports = nextConfig;
