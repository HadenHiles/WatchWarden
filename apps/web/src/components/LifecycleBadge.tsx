import { cn } from "@/lib/utils";

const POLICY_STYLES: Record<string, string> = {
    PERMANENT: "bg-green-950/60 text-green-400 border border-green-900/60",
    TEMPORARY_TRENDING: "bg-sky-950/60 text-sky-400 border border-sky-900/60",
    WATCH_AND_EXPIRE: "bg-orange-950/60 text-orange-400 border border-orange-900/60",
    PINNED: "bg-pink-950/60 text-pink-400 border border-pink-900/60",
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
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                style,
                className
            )}
        >
            {label}
        </span>
    );
}
