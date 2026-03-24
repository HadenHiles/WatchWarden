"use client";

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
    ShieldCheck,
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
        <aside className="w-60 flex-shrink-0 flex flex-col bg-gray-900 border-r border-gray-800">
            {/* Logo */}
            <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-800">
                <ShieldCheck className="text-brand-500 w-6 h-6" />
                <span className="font-bold text-white text-lg tracking-tight">Watch Warden</span>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto py-4 space-y-6 px-3">
                {NAV_SECTIONS.map((section) => (
                    <div key={section.label}>
                        <p className="px-2 mb-1 text-xs font-semibold uppercase tracking-widest text-gray-500">
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
                                                "flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm transition-colors",
                                                active
                                                    ? "bg-brand-600 text-white font-medium"
                                                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                                            )}
                                        >
                                            <Icon className="w-4 h-4 flex-shrink-0" />
                                            {label}
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
