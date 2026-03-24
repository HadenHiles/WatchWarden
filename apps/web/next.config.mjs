/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "image.tmdb.org" },
        ],
    },
    experimental: {
        typedRoutes: false,
    },
};

export default nextConfig;
