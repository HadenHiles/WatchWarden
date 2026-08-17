const path = require("path");

module.exports = {
    plugins: {
        // Next can execute PostCSS from the monorepo root during standalone
        // builds. Resolve the Tailwind config from this file so its content
        // globs always scan apps/web/src rather than a nonexistent root/src.
        tailwindcss: { config: path.join(__dirname, "tailwind.config.ts") },
        autoprefixer: {},
    },
};
