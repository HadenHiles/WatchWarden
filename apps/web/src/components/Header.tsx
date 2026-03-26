"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function Header() {
    const router = useRouter();

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
        router.refresh();
    }

    return (
        <header className="h-12 flex items-center justify-end px-6 bg-gray-950/80 border-b border-gray-800/60 backdrop-blur-sm shrink-0">
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
