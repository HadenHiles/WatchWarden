import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
    CANDIDATE: "bg-gray-700 text-gray-300",
    SUGGESTED: "bg-blue-900 text-blue-300",
    APPROVED: "bg-green-900 text-green-300",
    REJECTED: "bg-red-900 text-red-300",
    SNOOZED: "bg-yellow-900 text-yellow-300",
    REQUESTED: "bg-purple-900 text-purple-300",
    AVAILABLE: "bg-teal-900 text-teal-300",
    ACTIVE_TRENDING: "bg-indigo-900 text-indigo-300",
    CLEANUP_ELIGIBLE: "bg-orange-900 text-orange-300",
    EXPIRED: "bg-gray-800 text-gray-500",
    PINNED: "bg-pink-900 text-pink-300",
    // Suggestion statuses
    PENDING: "bg-blue-900 text-blue-300",
    FULFILLED: "bg-teal-900 text-teal-300",
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
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                style,
                className
            )}
        >
            {label}
        </span>
    );
}
