/** @type {import('next').NextConfig} */
const defaultCache = require('next-pwa/cache');

const withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    runtimeCaching: [
        {
            urlPattern: /^\/api\/(coach|ai)\/.*/i,
            handler: 'NetworkOnly',
            options: {
                cacheName: 'ai-endpoints-bypass',
            },
        },
        ...defaultCache
    ]
});

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

module.exports = withPWA(nextConfig);
