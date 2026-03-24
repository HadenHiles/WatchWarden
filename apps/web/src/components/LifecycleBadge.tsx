import { cn } from "@/lib/utils";

const POLICY_STYLES: Record<string, string> = {
    PERMANENT: "bg-green-900/50 text-green-300 border border-green-800",
    TEMPORARY_TRENDING: "bg-blue-900/50 text-blue-300 border border-blue-800",
    WATCH_AND_EXPIRE: "bg-orange-900/50 text-orange-300 border border-orange-800",
    PINNED: "bg-pink-900/50 text-pink-300 border border-pink-800",
};

const POLICY_LABELS: Record<string, string> = {
    PERMANENT: "Permanent",
    TEMPORARY_TRENDING: "Trend-based",
    WATCH_AND_EXPIRE: "Watch & Expire",
    PINNED: "Pinned",
};

interface LifecycleBadgeProps {
    policy: string;
    className?: string;
}

export function LifecycleBadge({ policy, className }: LifecycleBadgeProps) {
    const label = POLICY_LABELS[policy] ?? policy;
    const style = POLICY_STYLES[policy] ?? "bg-gray-800 text-gray-400 border border-gray-700";

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
