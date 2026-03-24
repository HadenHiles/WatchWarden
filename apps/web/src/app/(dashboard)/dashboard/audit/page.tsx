"use client";

import useSWR from "swr";
import { formatDate } from "@/lib/utils";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface AuditEntry {
    id: string;
    action: string;
    entityType: string;
    entityId: string;
    details?: unknown;
    createdAt: string;
}

export default function AuditPage() {
    const { data, isLoading } = useSWR<{ data: { items: AuditEntry[] } }>(
        apiUrl("/audit?pageSize=100"),
        fetcher
    );
    const entries = data?.data?.items ?? [];

    return (
        <div className="space-y-4">
            <h1 className="text-xl font-bold text-white">Audit Log</h1>

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-12 rounded-lg bg-gray-800 animate-pulse" />
                    ))}
                </div>
            )}

            <div className="rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs tracking-wide">
                        <tr>
                            <th className="px-4 py-3 text-left">Time</th>
                            <th className="px-4 py-3 text-left">Action</th>
                            <th className="px-4 py-3 text-left">Entity</th>
                            <th className="px-4 py-3 text-left">Message</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {entries.map((e) => (
                            <tr key={e.id} className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
                                <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                                    {formatDate(e.createdAt)}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="font-mono text-xs bg-gray-800 text-brand-400 rounded px-1.5 py-0.5">
                                        {e.action}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-gray-400 text-xs">
                                    {e.entityType}
                                </td>
                                <td className="px-4 py-3 text-gray-300 text-xs max-w-sm truncate">
                                    {e.details ? JSON.stringify(e.details) : "—"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!isLoading && entries.length === 0 && (
                    <div className="p-12 text-center text-gray-500">No audit entries.</div>
                )}
            </div>
        </div>
    );
}
