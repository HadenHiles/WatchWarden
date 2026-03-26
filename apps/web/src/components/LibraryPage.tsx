"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TitlesPage } from "@/components/TitlesPage";

// ─── Status tabs config ───────────────────────────────────────────────────────

const TABS = [
    { label: "All" as const },
    { label: "Approved" as const, status: "APPROVED" },
    { label: "Snoozed" as const, status: "SNOOZED" },
    { label: "Requested" as const, status: "REQUESTED" },
    { label: "Available" as const, status: "AVAILABLE" },
    { label: "Trending" as const, status: "ACTIVE_TRENDING" },
    { label: "Cleanup" as const, cleanupEligible: true as const },
    { label: "Pinned" as const, isPinned: true as const },
    { label: "Expired" as const, status: "EXPIRED" },
    { label: "Rejected" as const, status: "REJECTED" },
];

type TabConfig = (typeof TABS)[number];
type TabLabel = TabConfig["label"];

function tabFromUrl(status: string | null): TabLabel {
    if (!status) return "All";
    if (status === "CLEANUP_ELIGIBLE") return "Cleanup";
    if (status === "PINNED") return "Pinned";
    const found = TABS.find((t) => "status" in t && t.status === status);
    return found?.label ?? "All";
}

// ─── Component ────────────────────────────────────────────────────────────────

function LibraryContent() {
    const router = useRouter();
    const params = useSearchParams();
    const activeTab = tabFromUrl(params.get("status"));

    function selectTab(label: TabLabel) {
        const tab = TABS.find((t) => t.label === label)!;
        const next = new URLSearchParams();
        if ("status" in tab && tab.status) next.set("status", tab.status);
        else if ("cleanupEligible" in tab) next.set("status", "CLEANUP_ELIGIBLE");
        else if ("isPinned" in tab) next.set("status", "PINNED");
        router.replace(`/dashboard/library${next.toString() ? `?${next.toString()}` : ""}`);
    }

    const currentTab = TABS.find((t) => t.label === activeTab) ?? TABS[0];
    const titlesProps = {
        heading: activeTab === "All" ? "Library" : `${activeTab} Titles`,
        status: "status" in currentTab ? currentTab.status : undefined,
        cleanupEligible: "cleanupEligible" in currentTab ? currentTab.cleanupEligible : undefined,
        isPinned: "isPinned" in currentTab ? currentTab.isPinned : undefined,
    };

    return (
        <div className="space-y-4 max-w-5xl">
            {/* Status filter pills */}
            <div className="flex flex-wrap gap-1.5">
                {TABS.map((t) => (
                    <button
                        key={t.label}
                        onClick={() => selectTab(t.label)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${activeTab === t.label
                                ? "bg-brand-500/10 border-brand-500/30 text-brand-400 font-medium"
                                : "bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-200 hover:border-gray-600"
                            }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            <TitlesPage {...titlesProps} hideHeading />
        </div>
    );
}

export function LibraryPage() {
    return (
        <Suspense>
            <LibraryContent />
        </Suspense>
    );
}

