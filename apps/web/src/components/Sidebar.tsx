"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Sparkles,
    Library,
    Clapperboard,
    Briefcase,
    Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
    { href: "/dashboard/suggestions", label: "Suggestions", icon: Sparkles },
    { href: "/dashboard/library", label: "Library", icon: Library },
    { href: "/dashboard/plex/collections", label: "Plex", icon: Clapperboard },
    { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-[220px] flex-shrink-0 flex flex-col bg-gray-900/80 border-r border-gray-800/60 backdrop-blur-sm">
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800/60">
                <Image
                    src="/images/watch-warden.png"
                    alt="Watch Warden"
                    width={200}
                    height={90}
                    className="flex-shrink-0 object-contain"
                />
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
                {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
                    const active = exact ? pathname === href : pathname.startsWith(href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150",
                                active
                                    ? "bg-brand-500/10 text-brand-400 font-medium"
                                    : "text-gray-500 hover:text-gray-200 hover:bg-gray-800/60"
                            )}
                        >
                            <Icon
                                className={cn(
                                    "w-4 h-4 flex-shrink-0",
                                    active ? "text-brand-400" : "text-gray-600"
                                )}
                            />
                            {label}
                            {active && (
                                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-500" />
                            )}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}

