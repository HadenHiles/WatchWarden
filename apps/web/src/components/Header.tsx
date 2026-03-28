"use client";

import { useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";

interface HeaderProps {
    onToggleSidebar?: () => void;
}

export function Header({ onToggleSidebar }: HeaderProps) {
    const router = useRouter();

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
    }

    return (
        <header className="h-12 flex items-center justify-between px-4 sm:px-6 bg-gray-950/80 border-b border-gray-800/60 backdrop-blur-sm shrink-0">
            {/* Hamburger — mobile only */}
            <button
                onClick={onToggleSidebar}
                className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:text-gray-200 hover:bg-gray-800/60 transition-all"
                aria-label="Open navigation"
            >
                <Menu className="w-5 h-5" />
            </button>

            {/* Spacer so logout stays right-aligned on desktop */}
            <span className="hidden lg:block" />

            <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-800/60 transition-all"
            >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
            </button>
        </header>
    );
}
