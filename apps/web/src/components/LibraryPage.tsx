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
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Library</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            Track availability, retention, and cleanup from one place.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          View
          <select
            value={activeTab}
            onChange={(event) => selectTab(event.target.value as TabLabel)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-xs text-gray-200 focus:border-brand-500 focus:outline-none"
          >
            {TABS.map((tab) => (
              <option key={tab.label} value={tab.label}>
                {tab.label}
              </option>
            ))}
          </select>
        </label>
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
