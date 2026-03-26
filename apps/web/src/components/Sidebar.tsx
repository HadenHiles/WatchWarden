"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Film,
    Tv2,
    CheckCircle,
    XCircle,
    Clock,
    Send,
    Library,
    TrendingUp,
    Trash2,
    Pin,
    Archive,
    ScrollText,
    Settings,
    Briefcase,
    Download,
    Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
    {
        label: "Suggestions",
        items: [
            { href: "/dashboard/suggestions/movies", label: "Movies", icon: Film },
            { href: "/dashboard/suggestions/shows", label: "TV Shows", icon: Tv2 },
        ],
    },
    {
        label: "Workflow",
        items: [
            { href: "/dashboard/approved", label: "Approved", icon: CheckCircle },
            { href: "/dashboard/rejected", label: "Rejected", icon: XCircle },
            { href: "/dashboard/snoozed", label: "Snoozed", icon: Clock },
            { href: "/dashboard/requested", label: "Requested", icon: Send },
        ],
    },
    {
        label: "Library",
        items: [
            { href: "/dashboard/available", label: "Available", icon: Library },
            { href: "/dashboard/trending", label: "Trending", icon: TrendingUp },
            { href: "/dashboard/cleanup", label: "Cleanup", icon: Trash2 },
            { href: "/dashboard/pinned", label: "Pinned", icon: Pin },
            { href: "/dashboard/expired", label: "Expired", icon: Archive },
        ],
    },
    {
        label: "Admin",
        items: [
            { href: "/dashboard/audit", label: "Audit Log", icon: ScrollText },
            { href: "/dashboard/jobs", label: "Jobs", icon: Briefcase },
            { href: "/dashboard/exports", label: "Exports", icon: Download },
            { href: "/dashboard/requests", label: "Requests", icon: Inbox },
            { href: "/dashboard/settings", label: "Settings", icon: Settings },
        ],
    },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="w-[260px] flex-shrink-0 flex flex-col bg-gray-900/80 border-r border-gray-800/60 backdrop-blur-sm">
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-800/60">
                <Image
                    src="/images/watch-warden.png"
                    alt="Watch Warden"
                    width={36}
                    height={36}
                    className="flex-shrink-0 object-contain"
                />
                <span className="font-semibold text-white text-base tracking-tight">
                    Watch Warden
                </span>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-5 space-y-6 px-3">
                {NAV_SECTIONS.map((section) => (
                    <div key={section.label}>
                        <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-600">
                            {section.label}
                        </p>
                        <ul className="space-y-0.5">
                            {section.items.map(({ href, label, icon: Icon }) => {
                                const active = pathname === href || pathname.startsWith(href + "/");
                                return (
                                    <li key={href}>
                                        <Link
                                            href={href}
                                            className={cn(
                                                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150",
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
                                                <span className="ml-auto w-1 h-1 rounded-full bg-brand-500" />
                                            )}
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>
        </aside>
    );
}
