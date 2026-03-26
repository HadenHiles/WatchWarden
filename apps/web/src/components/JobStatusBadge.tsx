import { cn } from "@/lib/utils";

interface JobStatusBadgeProps {
    status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
    className?: string;
}

const STYLES: Record<string, string> = {
    RUNNING: "bg-sky-950/80 text-sky-400 animate-pulse",
    COMPLETED: "bg-green-950/80 text-green-400",
    FAILED: "bg-red-950/80 text-red-400",
    SKIPPED: "bg-gray-900/80 text-gray-600",
};

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                STYLES[status] ?? "bg-gray-800 text-gray-500",
                className
            )}
        >
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}
