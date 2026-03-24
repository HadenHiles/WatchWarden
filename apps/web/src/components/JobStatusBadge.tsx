import { cn } from "@/lib/utils";

interface JobStatusBadgeProps {
    status: "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
    className?: string;
}

const STYLES: Record<string, string> = {
    RUNNING: "bg-blue-900 text-blue-300 animate-pulse",
    COMPLETED: "bg-green-900 text-green-300",
    FAILED: "bg-red-900 text-red-300",
    SKIPPED: "bg-gray-800 text-gray-500",
};

export function JobStatusBadge({ status, className }: JobStatusBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                STYLES[status] ?? "bg-gray-700 text-gray-400",
                className
            )}
        >
            {status.charAt(0) + status.slice(1).toLowerCase()}
        </span>
    );
}
