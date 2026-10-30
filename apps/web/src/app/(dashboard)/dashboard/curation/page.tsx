"use client";

import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { RefreshCw, ShieldCheck, HardDrive, ExternalLink } from "lucide-react";
import { apiUrl } from "@/lib/api-client";

interface ReviewItem { titleId: string; title: string; mediaType: string; decision: string; reasons: string[]; reviewKind: string }
interface Status {
    jobs: Array<{ name: string; lastAttempt: { status: string; startedAt: string } | null; lastSuccessAt: string | null }>;
    shelves: Array<{ id: string; name: string; enabled: boolean; itemCount: number; lastSyncAt: string | null }>;
    catalogue: { storagePolicy: { maxStorageBytes: number } | null;
        accounting: { managedBytes: number; reservedBytes: number; managedTitles: number; observedAt: string } | null;
        retentionReview: { complete: boolean; recordedItems: number; items: ReviewItem[] } | null };
}
const fetcher = async (url: string) => {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new Error("Curation status is unavailable");
    return response.json();
};
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "Not yet recorded";
const bytes = (value: number) => `${(value / 1e9).toFixed(1)} GB`;

export default function CurationPage() {
    const { data, error, mutate } = useSWR<{ data: Status }>(apiUrl("/plex/curation-status"), fetcher, { refreshInterval: 15000 });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const status = data?.data;
    async function action(path: string) {
        setBusy(true); setNotice("");
        try {
            const response = await fetch(apiUrl(path), { method: "POST", credentials: "include" });
            if (!response.ok) throw new Error("Action was not accepted");
            setNotice(path.includes("/keep") ? "Kept in WatchWarden. Other retention services remain independent." : "Refresh queued. No media acquisitions or deletions.");
            await mutate();
        } catch (failure) { setNotice(failure instanceof Error ? failure.message : "Action failed"); }
        finally { setBusy(false); }
    }
    const accounting = status?.catalogue.accounting;
    const maximum = status?.catalogue.storagePolicy?.maxStorageBytes ?? 1e12;
    const used = accounting ? accounting.managedBytes + accounting.reservedBytes : 0;
    return <div className="max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
            <div><h1 className="text-xl font-semibold text-white">Curation</h1><p className="mt-1 text-sm text-gray-400">Canada first · {bytes(maximum)} catalogue budget</p></div>
            <button disabled={busy} onClick={() => action("/plex/curation-refresh")} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-gray-950 disabled:opacity-50"><RefreshCw size={16} />Refresh curation</button>
        </header>
        {(notice || error) && <p role="status" className="text-sm text-amber-300">{notice || "Curation status is unavailable. Existing shelves are unchanged."}</p>}
        {!status && !error && <p className="text-sm text-gray-400">Loading curation status...</p>}
        <section className="border-y border-gray-800 py-5">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white"><HardDrive size={18} />Storage</h2>
            <div className="grid gap-4 sm:grid-cols-4 text-sm">
                <div><p className="text-gray-500">Recorded media</p><p className="mt-1 text-white">{accounting ? bytes(accounting.managedBytes) : "Unknown"}</p></div>
                <div><p className="text-gray-500">Reserved</p><p className="mt-1 text-white">{accounting ? bytes(accounting.reservedBytes) : "Unknown"}</p></div>
                <div><p className="text-gray-500">Budget headroom</p><p className="mt-1 text-white">{accounting ? bytes(Math.max(0, maximum - used)) : "Awaiting accounting"}</p></div>
                <div><p className="text-gray-500">Last observation</p><p className="mt-1 text-white">{date(accounting?.observedAt)}</p></div>
            </div>
            <progress aria-label="Catalogue storage budget" max={maximum} value={used} className="mt-4 h-2 w-full accent-emerald-500" />
            <p className="mt-2 text-xs text-gray-500">Plex logical media bytes. Physical free space and hardlink savings are not established.</p>
        </section>
        <section><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-semibold text-white">Home shelves</h2><Link href="/dashboard/plex/collections" className="inline-flex items-center gap-1 text-sm text-brand-400">Manage shelves<ExternalLink size={14} /></Link></div>
            <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-gray-800 text-gray-500"><tr><th className="py-2">Shelf</th><th>Titles</th><th>Last verified sync</th></tr></thead><tbody>{status?.shelves.filter(shelf => shelf.enabled).map(shelf => <tr key={shelf.id} className="border-b border-gray-800/60"><td className="py-3 text-gray-200">{shelf.name}</td><td className="text-gray-400">{shelf.itemCount}</td><td className="text-gray-400">{date(shelf.lastSyncAt)}</td></tr>)}</tbody></table></div>
        </section>
        <section><h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-white"><ShieldCheck size={18} />Retention review</h2>
            {!status?.catalogue.retentionReview && <p className="text-sm text-gray-500">No retention review recorded.</p>}
            <div className="divide-y divide-gray-800">{status?.catalogue.retentionReview?.items.map(item => <article key={item.titleId} className="flex flex-wrap items-start justify-between gap-3 py-4"><div className="min-w-0 flex-1"><h3 className="break-words text-sm font-medium text-gray-200">{item.title}</h3><p className="mt-1 text-xs text-gray-400">{item.decision === "keep" ? "Kept" : item.reviewKind === "owner_decision" ? "Your decision" : "Evidence needed"}</p><p className="mt-1 break-words text-xs text-gray-500">{item.reasons.map(reason => reason.replaceAll("_", " ")).join(", ")}</p></div>{item.decision !== "keep" && <button disabled={busy} onClick={() => action(`/plex/retention/${encodeURIComponent(item.titleId)}/keep`)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 disabled:opacity-50"><ShieldCheck size={14} />Keep</button>}</article>)}</div>
            {status?.catalogue.retentionReview && <p className="mt-3 text-xs text-gray-500">Showing {status.catalogue.retentionReview.items.length} of {status.catalogue.retentionReview.recordedItems} recorded titles. {status.catalogue.retentionReview.complete ? "" : "Inventory is partial."} No deletion is authorized by this review.</p>}
        </section>
        <section><h2 className="mb-3 text-base font-semibold text-white">Automation</h2><div className="grid gap-2 sm:grid-cols-2">{status?.jobs.map(job => <div key={job.name} className="flex justify-between gap-4 border-b border-gray-800 py-2 text-xs"><span className="text-gray-400">{job.name}</span><span className={job.lastAttempt?.status === "FAILED" ? "text-red-400" : "text-gray-300"}>{job.lastAttempt?.status ?? "Not yet run"}</span></div>)}</div></section>
    </div>;
}