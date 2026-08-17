import type { Config } from "tailwindcss";
import path from "path";
import { fileURLToPath } from "url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));

const config: Config = {
    content: [
        path.join(webRoot, "src/pages/**/*.{js,ts,jsx,tsx,mdx}"),
        path.join(webRoot, "src/components/**/*.{js,ts,jsx,tsx,mdx}"),
        path.join(webRoot, "src/app/**/*.{js,ts,jsx,tsx,mdx}"),
    ],
    theme: {
        extend: {
            colors: {
                brand: {
                    50: "#fffbeb",
                    100: "#fef3c7",
                    200: "#fde68a",
                    300: "#fcd34d",
                    400: "#fbbf24",
                    500: "#f5a623",
                    600: "#d97706",
                    700: "#b45309",
                    800: "#92400e",
                    900: "#78350f",
                    950: "#451a03",
                },
            },
            fontFamily: {
                sans: ["var(--font-inter)", "Inter Variable", "Inter", "system-ui", "sans-serif"],
            },
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
            },
            animation: {
                "fade-in": "fadeIn 0.2s ease-out",
            },
            keyframes: {
                fadeIn: {
                    "0%": { opacity: "0", transform: "translateY(4px)" },
                    "100%": { opacity: "1", transform: "translateY(0)" },
                },
            },
        },
    },
    plugins: [],
};

export default config;
