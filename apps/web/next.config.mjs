/** @type {import('next').NextConfig} */
const nextConfig = {
    output: "standalone",
    eslint: {
        // Linting is run separately; don't block production builds.
        ignoreDuringBuilds: true,
    },
    images: {
        remotePatterns: [
            { protocol: "https", hostname: "image.tmdb.org" },
        ],
    },
    experimental: {
        typedRoutes: false,
        optimizePackageImports: [
            "lucide-react",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-select",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-slot",
        ],
    },
};

export default nextConfig;
