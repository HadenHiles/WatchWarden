"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ArrowUpCircle, X } from "lucide-react";

interface UpdateCheckResponse {
    updateAvailable: boolean;
    currentVersion: string;
    latestVersion: string | null;
}

const DISMISS_KEY = "ww_dismissed_update_version";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function UpdateBanner() {
    const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    // Read localStorage only after mount to avoid SSR mismatch.
    useEffect(() => {
        setDismissedVersion(localStorage.getItem(DISMISS_KEY));
        setMounted(true);
    }, []);

    // Check once on mount, then every 6 hours.
    const { data } = useSWR<UpdateCheckResponse>(
        "/api/update-check",
        fetcher,
        { refreshInterval: 6 * 60 * 60 * 1000, revalidateOnFocus: false }
    );

    function dismiss() {
        if (!data?.latestVersion) return;
        localStorage.setItem(DISMISS_KEY, data.latestVersion);
        setDismissedVersion(data.latestVersion);
    }

    if (
        !mounted ||
        !data?.updateAvailable ||
        !data.latestVersion ||
        dismissedVersion === data.latestVersion
    ) {
        return null;
    }

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-brand-500/10 border-b border-brand-500/20 text-sm">
            <ArrowUpCircle className="w-4 h-4 text-brand-400 flex-shrink-0" />
            <span className="text-brand-300 flex-1 min-w-0 truncate">
                Update available —{" "}
                <span className="font-semibold text-brand-200">v{data.latestVersion}</span>
                {" "}is ready on Docker Hub
                {data.currentVersion && (
                    <span className="text-brand-400/70 ml-1.5 text-xs">(current: v{data.currentVersion})</span>
                )}
            </span>
            <a
                href={`https://hub.docker.com/r/${process.env.NEXT_PUBLIC_DOCKER_IMAGE ?? "hadenhiles/watchwarden"}/tags`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-400 hover:text-brand-200 underline underline-offset-2 flex-shrink-0 transition-colors"
            >
                View on Docker Hub
            </a>
            <button
                onClick={dismiss}
                title="Dismiss until next update"
                className="p-1 rounded-md text-brand-500 hover:text-brand-200 hover:bg-brand-500/10 transition-all flex-shrink-0"
            >
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}
