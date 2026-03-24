import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
