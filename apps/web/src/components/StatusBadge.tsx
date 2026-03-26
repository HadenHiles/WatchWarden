import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
    CANDIDATE: "bg-gray-800/80 text-gray-500",
    SUGGESTED: "bg-blue-950/80 text-blue-400",
    APPROVED: "bg-green-950/80 text-green-400",
    REJECTED: "bg-red-950/80 text-red-400",
    SNOOZED: "bg-brand-950/80 text-brand-400",
    REQUESTED: "bg-purple-950/80 text-purple-400",
    AVAILABLE: "bg-teal-950/80 text-teal-400",
    ACTIVE_TRENDING: "bg-sky-950/80 text-sky-400",
    CLEANUP_ELIGIBLE: "bg-orange-950/80 text-orange-400",
    EXPIRED: "bg-gray-900/80 text-gray-600",
    PINNED: "bg-pink-950/80 text-pink-400",
    // Suggestion statuses
    PENDING: "bg-blue-950/80 text-blue-400",
    FULFILLED: "bg-teal-950/80 text-teal-400",
};

const STATUS_LABELS: Record<string, string> = {
    ACTIVE_TRENDING: "Trending",
    CLEANUP_ELIGIBLE: "Cleanup",
};

interface StatusBadgeProps {
    status: string;
    className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
    const label = STATUS_LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
    const style = STATUS_STYLES[status] ?? "bg-gray-700 text-gray-300";

    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                style,
                className
            )}
        >
            {label}
        </span>
    );
}
