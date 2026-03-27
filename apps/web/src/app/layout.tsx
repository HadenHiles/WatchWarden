import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Watch Warden",
    description: "Automated playlists, actually worth watching.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className="dark" suppressHydrationWarning>
            <body className="antialiased" suppressHydrationWarning>{children}</body>
        </html>
    );
}
