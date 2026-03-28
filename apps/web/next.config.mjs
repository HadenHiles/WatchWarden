import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { version } = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8")
);

/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        NEXT_PUBLIC_APP_VERSION: version,
        // Docker Hub image to check for updates (namespace/repository).
        // Override with DOCKER_IMAGE env var if you use a different registry slug.
        DOCKER_UPDATE_IMAGE: process.env.DOCKER_UPDATE_IMAGE ?? "hadenhiles/watchwarden",
        NEXT_PUBLIC_DOCKER_IMAGE: process.env.DOCKER_UPDATE_IMAGE ?? "hadenhiles/watchwarden",
    },
    output: "standalone",
    // Required for pnpm monorepo standalone builds: tells Next.js to use the
    // monorepo root as the tracing root so that (a) server.js lands at
    // apps/web/server.js inside the standalone output (matching the Dockerfile
    // COPY target and supervisord command) and (b) public-file serving uses
    // the correct dir, fixing the logo 404.
    outputFileTracingRoot: path.join(__dirname, "../../"),
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
