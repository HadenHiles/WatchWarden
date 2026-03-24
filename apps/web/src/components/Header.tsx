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
        <header className="h-14 flex items-center justify-between px-6 bg-gray-900 border-b border-gray-800 shrink-0">
            <div />
            <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
                <LogOut className="w-4 h-4" />
                Sign out
            </button>
        </header>
    );
}
