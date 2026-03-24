import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatScore(score: number): string {
    return `${Math.round(score * 100)}`;
}

export function scoreColor(score: number): string {
    if (score >= 0.75) return "text-green-400";
    if (score >= 0.5) return "text-yellow-400";
    if (score >= 0.25) return "text-orange-400";
    return "text-red-400";
}

export function formatDate(date: string | Date | null | undefined): string {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, " ");
}
