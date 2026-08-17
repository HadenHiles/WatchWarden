"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { AlertCircle, Check, ChevronDown, ChevronUp, Clapperboard, Film, GripVertical, Library, Loader2, Plus, RefreshCw, Search, Settings2, Sparkles, Trash2, Tv2, X } from "lucide-react";
import { apiUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then(async (response) => {
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Request failed");
    return body;
});

const PROVIDERS = ["Netflix", "Disney+", "Prime Video", "Apple TV+", "Crave", "Paramount+", "Max", "Crunchyroll", "Shudder", "BritBox", "AMC+", "STARZ", "Hulu", "Peacock"];
const INPUT = "w-full rounded-lg bg-gray-950/70 border border-gray-700/70 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500/70";

interface PlexSection { key: string; title: string; type: string }
interface Shelf {
    id: string; name: string; plexKey: string | null; sectionId: string; mediaType: "MOVIE" | "SHOW";
    shelfType: "CULTURAL_TRENDING" | "PROVIDER_TRENDING" | "RECENTLY_RELEASED" | "FAMILY_POPULAR" | "GENRE" | "DECADE" | "SMART" | "CUSTOM";
    provider: string | null; collectionType: "SMART" | "TOP_TRENDING"; streamingProviders: string[];
    shelfConfig: { genres?: string[]; startYear?: number; endYear?: number } | null;
    enabled: boolean; publishToHome: boolean; publishToSharedHome: boolean; homePriority: number;
    maxItems: number; releaseWindowDays: number; itemCount: number; lastSyncAt: string | null;
}
interface HomeSettings { primaryRegion: string; fallbackRegion: string; shelfLimit: number; recentlyReleasedDays: number; backfillRecentReleases: boolean; recentlyReleasedBackfillDays: number; defaultMaxItems: number }
interface HomeResponse { settings: HomeSettings; shelves: Shelf[] }
interface ShelfItem {
    id: string; title: string; year: number | null; posterPath: string | null; mediaType: "MOVIE" | "SHOW";
    inLibrary: boolean; manuallyAdded: boolean; manuallyExcluded: boolean;
    trendSnapshots: Array<{ trendScore: number; providerRank: number | null }>;
}
interface ShelfCandidate {
    id: string; title: string; year: number | null; posterPath: string | null; mediaType: "MOVIE" | "SHOW"; streamingOn: string[];
}
interface DashboardStats {
    suggestions: { pendingMovies: number; pendingShows: number };
    titles: { approved: number; requested: number; available: number; trending: number; cleanupEligible: number; pinned: number; inLibrary: number };
    jobs: Array<{ jobName: string; last: { status: string; startedAt: string; completedAt: string | null } | null }>;
}

const SHELF_LABELS: Record<Shelf["shelfType"], string> = {
    CULTURAL_TRENDING: "Cultural",
    PROVIDER_TRENDING: "Platform",
    RECENTLY_RELEASED: "Recent releases",
    FAMILY_POPULAR: "FamFlix",
    GENRE: "Genre",
    DECADE: "Decade",
    SMART: "Smart",
    CUSTOM: "Custom",
};

function Toggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
    return (
        <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex items-center gap-2 text-left disabled:opacity-40">
            <span className={cn("relative h-5 w-9 rounded-full transition-colors", checked ? "bg-brand-500" : "bg-gray-700")}>
                <span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked && "translate-x-4")} />
            </span>
            <span className="text-xs text-gray-300">{label}</span>
        </button>
    );
}

function ShelfPreview({ shelf, onChanged, onRename }: { shelf: Shelf; onChanged: () => void; onRename: (name: string) => Promise<void> }) {
    const { data, isLoading, mutate } = useSWR<{ data: ShelfItem[] }>(apiUrl(`/plex/collections/${shelf.id}/items`), fetcher);
    const { data: candidateData, isLoading: candidatesLoading, mutate: mutateCandidates } = useSWR<{ data: ShelfCandidate[] }>(apiUrl(`/plex/collections/${shelf.id}/candidates`), fetcher);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Array<{ id: string; title: string; year: number | null }>>([]);
    const [name, setName] = useState(shelf.name);
    const [renaming, setRenaming] = useState(false);
    const [requestingId, setRequestingId] = useState<string | null>(null);
    const [rejectingId, setRejectingId] = useState<string | null>(null);

    useEffect(() => setName(shelf.name), [shelf.name]);

    async function rename() {
        const nextName = name.trim();
        if (!nextName || nextName === shelf.name) return setName(shelf.name);
        setRenaming(true);
        try { await onRename(nextName); } finally { setRenaming(false); }
    }

    async function search(value: string) {
        setQuery(value);
        if (value.trim().length < 2) return setResults([]);
        const response = await fetch(apiUrl(`/titles?search=${encodeURIComponent(value)}&mediaType=${shelf.mediaType}&inLibrary=true&pageSize=8`), { credentials: "include" });
        const body = await response.json();
        setResults(body.data?.items ?? []);
    }

    async function override(titleId: string, action: "include" | "exclude") {
        await fetch(apiUrl(`/plex/collections/${shelf.id}/titles`), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ titleId, action }) });
        setQuery(""); setResults([]); await mutate(); onChanged();
    }

    async function approveRequest(titleId: string) {
        setRequestingId(titleId);
        try {
            const response = await fetch(apiUrl(`/requests/${titleId}`), { method: "POST", credentials: "include" });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Could not submit request");
            await mutateCandidates();
            onChanged();
        } finally {
            setRequestingId(null);
        }
    }

    async function rejectCandidate(titleId: string) {
        setRejectingId(titleId);
        try {
            const response = await fetch(apiUrl(`/plex/collections/${shelf.id}/candidates/${titleId}/reject`), { method: "POST", credentials: "include" });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Could not reject candidate");
            await mutateCandidates();
        } finally {
            setRejectingId(null);
        }
    }

    const items = data?.data ?? [];
    return (
        <div className="space-y-5 rounded-xl border border-gray-800 bg-gray-950/35 p-5">
            <div className="max-w-md">
                <label className="text-xs text-gray-400">Shelf title</label>
                <div className="mt-1 flex gap-2">
                    <input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void rename(); if (event.key === "Escape") setName(shelf.name); }} className={INPUT} />
                    <button type="button" onClick={() => void rename()} disabled={renaming || !name.trim() || name.trim() === shelf.name} className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 text-sm font-semibold text-gray-950 disabled:opacity-40">{renaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save</button>
                </div>
                <p className="mt-1 text-[11px] text-gray-500">The Plex Home row will be renamed during the next Home sync.</p>
            </div>
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
                <input value={query} onChange={(event) => search(event.target.value)} placeholder="Add a local title manually…" className={`${INPUT} pl-9`} />
                {results.length > 0 && <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
                    {results.map((title) => <button key={title.id} onClick={() => override(title.id, "include")} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-800">
                        <span className="text-sm text-gray-200">{title.title} {title.year ? <span className="text-gray-500">({title.year})</span> : null}</span><Plus className="h-3.5 w-3.5 text-brand-400" />
                    </button>)}
                </div>}
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
            <section><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-semibold text-white">Now playing</h3><p className="text-[11px] text-gray-500">Titles already available in Plex.</p></div><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-400">{items.length} / {shelf.maxItems}</span></div>
            {isLoading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div> : items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-800 py-10 text-center text-sm text-gray-500">No local matches yet. Run a trend and Plex sync to populate this shelf.</div>
            ) : <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-3 2xl:grid-cols-4">
                {items.map((item) => {
                    const rank = item.trendSnapshots.find((snapshot) => snapshot.providerRank)?.providerRank;
                    const heat = Math.round(Math.max(0, ...item.trendSnapshots.map((snapshot) => snapshot.trendScore)) * 100);
                    return <div key={item.id} className="group relative min-w-0">
                        {item.posterPath ? <img src={`https://image.tmdb.org/t/p/w185${item.posterPath}`} alt="" className="aspect-[2/3] w-full rounded-lg bg-gray-800 object-cover" /> : <div className="flex aspect-[2/3] items-center justify-center rounded-lg bg-gray-800"><Film className="h-5 w-5 text-gray-600" /></div>}
                        <button onClick={() => override(item.id, "exclude")} title="Exclude from this shelf" className="absolute right-1 top-1 rounded-full bg-gray-950/90 p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-400"><X className="h-3 w-3" /></button>
                        <p className="mt-1 truncate text-xs font-medium text-gray-200">{item.title}</p>
                        <p className="text-[11px] text-gray-500">{rank ? `Platform #${rank}` : `Heat ${heat}`}{item.manuallyAdded ? " · Added" : ""}</p>
                    </div>;
                })}
            </div>}</section>
            <section className="border-t border-gray-800/80 pt-5 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
                <div className="mb-3 flex items-end justify-between gap-3">
                    <div><h3 className="text-sm font-semibold text-white">Up next</h3><p className="mt-0.5 text-[11px] text-gray-500">Best missing matches. Recruit one and Watch Warden tracks it through download to this shelf.</p></div>
                    <span className="text-[11px] text-brand-400">Acquisition queue</span>
                </div>
                {candidatesLoading ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-gray-600" /></div> : (candidateData?.data.length ?? 0) === 0 ? <div className="rounded-lg border border-dashed border-gray-800 py-6 text-center text-xs text-gray-600">Queue cleared — this shelf has no missing recommendations.</div> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
                    {candidateData!.data.map((candidate) => <div key={candidate.id} className="min-w-0 overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
                        {candidate.posterPath ? <img src={`https://image.tmdb.org/t/p/w185${candidate.posterPath}`} alt="" className="aspect-[2/3] w-full bg-gray-800 object-cover" /> : <div className="flex aspect-[2/3] items-center justify-center bg-gray-800"><Film className="h-5 w-5 text-gray-600" /></div>}
                        <div className="p-2"><p className="truncate text-xs font-medium text-gray-200" title={candidate.title}>{candidate.title}</p><p className="mt-0.5 text-[10px] text-gray-600">{candidate.year ?? "Year unknown"}</p><div className="mt-2 grid grid-cols-2 gap-1"><button onClick={() => approveRequest(candidate.id)} disabled={requestingId === candidate.id || rejectingId === candidate.id} className="flex items-center justify-center gap-1 rounded-md bg-brand-500 px-1 py-1.5 text-[10px] font-semibold text-gray-950 hover:bg-brand-400 disabled:opacity-50">{requestingId === candidate.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Approve</button><button onClick={() => rejectCandidate(candidate.id)} disabled={requestingId === candidate.id || rejectingId === candidate.id} title="Reject globally" className="flex items-center justify-center gap-1 rounded-md border border-gray-700 px-1 py-1.5 text-[10px] font-semibold text-gray-400 hover:border-red-500/60 hover:text-red-400 disabled:opacity-50">{rejectingId === candidate.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}Reject</button></div></div>
                    </div>)}
                </div>}
            </section></div>
        </div>
    );
}

export default function PlexHomePage() {
    const { data, error, mutate, isLoading } = useSWR<{ data: HomeResponse }>(apiUrl("/plex/home"), fetcher);
    const { data: statsData } = useSWR<{ data: DashboardStats }>(apiUrl("/stats"), fetcher, { refreshInterval: 30000 });
    const { data: sectionData } = useSWR<{ data: PlexSection[] }>(apiUrl("/plex/sections"), fetcher);
    const shelves = useMemo(() => [...(data?.data.shelves ?? [])].sort((a, b) => a.homePriority - b.homePriority || a.id.localeCompare(b.id)), [data]);
    const sections = sectionData?.data ?? [];
    const movieSections = sections.filter((section) => section.type === "movie");
    const showSections = sections.filter((section) => section.type === "show");
    const [selected, setSelected] = useState<string | null>(null);
    const [setupOpen, setSetupOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
    const [settings, setSettings] = useState<HomeSettings>({ primaryRegion: "CA", fallbackRegion: "US", shelfLimit: 6, recentlyReleasedDays: 90, backfillRecentReleases: true, recentlyReleasedBackfillDays: 365, defaultMaxItems: 20 });
    const [setup, setSetup] = useState({ movieSectionId: "", showSectionId: "", providers: ["Netflix", "Disney+", "Prime Video", "Apple TV+"] });

    useEffect(() => { if (data?.data.settings) setSettings(data.data.settings); }, [data]);
    useEffect(() => { if (shelves.length && !shelves.some((shelf) => shelf.id === selected)) setSelected(shelves[0].id); }, [shelves, selected]);
    useEffect(() => { setSetup((current) => ({ ...current, movieSectionId: current.movieSectionId || movieSections[0]?.key || "", showSectionId: current.showSectionId || showSections[0]?.key || "" })); }, [sectionData]);

    function flash(tone: "success" | "error", text: string) { setNotice({ tone, text }); window.setTimeout(() => setNotice(null), 3500); }
    async function patchShelf(shelf: Shelf, patch: Record<string, unknown>, message?: string) {
        setBusy(shelf.id);
        try {
            const response = await fetch(apiUrl(`/plex/collections/${shelf.id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(patch) });
            const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not update shelf");
            await mutate(); if (message) flash("success", message);
        } catch (reason) { flash("error", reason instanceof Error ? reason.message : "Could not update shelf"); } finally { setBusy(null); }
    }
    async function moveShelf(index: number, direction: -1 | 1) {
        const other = shelves[index + direction]; const shelf = shelves[index]; if (!other) return;
        setBusy(shelf.id);
        try {
            const reordered = [...shelves];
            reordered.splice(index, 1); reordered.splice(index + direction, 0, shelf);
            await Promise.all(reordered.map((item, position) => fetch(apiUrl(`/plex/collections/${item.id}`), { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ homePriority: (position + 1) * 10 }) })));
            await mutate();
        } finally { setBusy(null); }
    }
    async function saveSettings() {
        setBusy("settings");
        try {
            const response = await fetch(apiUrl("/plex/home/settings"), { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(settings) });
            if (!response.ok) throw new Error("Could not save Home settings"); await mutate(); setSettingsOpen(false); flash("success", "Home settings saved");
        } catch (reason) { flash("error", reason instanceof Error ? reason.message : "Could not save settings"); } finally { setBusy(null); }
    }
    async function createDefaults() {
        if (!setup.movieSectionId || !setup.showSectionId) return flash("error", "Choose both Plex libraries first");
        setBusy("setup");
        try {
            const response = await fetch(apiUrl("/plex/home/setup"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(setup) });
            const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not create shelves");
            await mutate(); setSetupOpen(false); flash("success", `${body.data.length} disabled shelves added. Review them before publishing.`);
        } catch (reason) { flash("error", reason instanceof Error ? reason.message : "Could not create shelves"); } finally { setBusy(null); }
    }
    async function syncNow() {
        setBusy("sync");
        try {
            await fetch(apiUrl("/jobs/plex-library-sync/trigger"), { method: "POST", credentials: "include" });
            const response = await fetch(apiUrl("/jobs/plex-sync/trigger"), { method: "POST", credentials: "include" });
            if (!response.ok) throw new Error("Plex sync could not be started"); flash("success", "Plex Home sync started");
        } catch (reason) { flash("error", reason instanceof Error ? reason.message : "Could not start sync"); } finally { setBusy(null); }
    }
    async function removeShelf(shelf: Shelf) {
        if (!window.confirm(`Stop managing “${shelf.name}”? The Plex collection will be left untouched.`)) return;
        await fetch(apiUrl(`/plex/collections/${shelf.id}`), { method: "DELETE", credentials: "include" }); await mutate(); flash("success", "Shelf removed from Watch Warden");
    }

    const published = shelves.filter((shelf) => shelf.enabled && shelf.publishToHome).length;
    const stats = statsData?.data;
    const plexJobs = stats?.jobs.filter((job) => job.jobName === "plex-library-sync" || job.jobName === "plex-sync") ?? [];
    const automationHealthy = plexJobs.length === 2 && plexJobs.every((job) => job.last?.status === "COMPLETED");
    const selectedShelf = shelves.find((shelf) => shelf.id === selected) ?? shelves[0];
    return <div className="mx-auto w-full max-w-6xl space-y-5">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h1 className="text-xl font-bold tracking-tight text-white">Plex Home</h1><p className="mt-1 text-sm text-gray-400">Shape the streaming experience your household sees when Plex opens.</p></div>
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setSettingsOpen(!settingsOpen)} className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white"><Settings2 className="h-4 w-4" />Home settings</button>
                <button onClick={() => setSetupOpen(!setupOpen)} className="flex items-center gap-2 rounded-lg border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-white"><Plus className="h-4 w-4" />Add recommended shelves</button>
                <button onClick={syncNow} disabled={busy === "sync"} className="flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-brand-400 disabled:opacity-50">{busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Sync Home</button>
            </div>
        </header>

        {notice && <div className={cn("rounded-lg border px-4 py-3 text-sm", notice.tone === "success" ? "border-green-800/60 bg-green-950/30 text-green-300" : "border-red-800/60 bg-red-950/30 text-red-300")}>{notice.text}</div>}
        {error && <div className="flex gap-2 rounded-lg border border-red-800/60 bg-red-950/30 px-4 py-3 text-sm text-red-300"><AlertCircle className="h-4 w-4" />{error.message}</div>}

        <section className="rounded-xl border border-brand-500/20 bg-gradient-to-r from-brand-950/35 to-gray-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand-400"/><h2 className="text-sm font-semibold text-white">Your curation loop</h2></div><p className="mt-1 text-xs text-gray-400">Discover → recruit → download → shelve. Automations carry each title forward.</p></div><Link href="/dashboard/library" className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/70 px-3 py-2 text-xs text-gray-300 hover:text-white"><Library className="h-3.5 w-3.5"/>Open title library</Link></div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[{ label: "Candidates", value: (stats?.suggestions.pendingMovies ?? 0) + (stats?.suggestions.pendingShows ?? 0), tone: "text-brand-400" }, { label: "Requested", value: stats?.titles.requested ?? 0, tone: "text-purple-400" }, { label: "Available", value: stats?.titles.available ?? 0, tone: "text-emerald-400" }, { label: "In Plex", value: stats?.titles.inLibrary ?? 0, tone: "text-cyan-400" }].map((step, index) => <div key={step.label} className="relative rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-3"><p className="text-[10px] uppercase tracking-wider text-gray-600">Step {index + 1}</p><div className="mt-1 flex items-end justify-between"><span className="text-xs text-gray-400">{step.label}</span><span className={cn("text-xl font-bold tabular-nums", step.tone)}>{step.value}</span></div></div>)}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs"><span className={automationHealthy ? "text-emerald-400" : "text-amber-400"}>{automationHealthy ? "● Plex automations healthy" : "● Automation needs attention"}</span><Link href="/dashboard/jobs" className="text-gray-500 hover:text-gray-200">View schedule & run history →</Link></div>
        </section>

        {settingsOpen && <section className="rounded-xl border border-gray-700 bg-gray-900 p-5">
            <div className="mb-4"><h2 className="font-semibold text-white">Home behavior</h2><p className="text-xs text-gray-400">These settings apply to every managed shelf.</p></div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-xs text-gray-400">Primary region<select value={settings.primaryRegion} onChange={(e) => { const primaryRegion = e.target.value; setSettings({ ...settings, primaryRegion, fallbackRegion: primaryRegion === "CA" ? "US" : "CA" }); }} className={`${INPUT} mt-1`}><option>CA</option><option>US</option></select></label>
                <label className="text-xs text-gray-400">Fallback region<select value={settings.fallbackRegion} onChange={(e) => setSettings({ ...settings, fallbackRegion: e.target.value })} className={`${INPUT} mt-1`}><option disabled value={settings.primaryRegion}>{settings.primaryRegion}</option><option value={settings.primaryRegion === "CA" ? "US" : "CA"}>{settings.primaryRegion === "CA" ? "US" : "CA"}</option></select></label>
                <label className="text-xs text-gray-400">Home shelf limit<input type="number" min={0} max={20} value={settings.shelfLimit} onChange={(e) => setSettings({ ...settings, shelfLimit: Number(e.target.value) })} className={`${INPUT} mt-1`} /></label>
                <label className="text-xs text-gray-400">Recent movie window<input type="number" min={1} max={365} value={settings.recentlyReleasedDays} onChange={(e) => setSettings({ ...settings, recentlyReleasedDays: Number(e.target.value) })} className={`${INPUT} mt-1`} /></label>
                <label className="text-xs text-gray-400">Backfill lookback<input type="number" min={settings.recentlyReleasedDays} max={730} disabled={!settings.backfillRecentReleases} value={settings.recentlyReleasedBackfillDays} onChange={(e) => setSettings({ ...settings, recentlyReleasedBackfillDays: Number(e.target.value) })} className={`${INPUT} mt-1 disabled:opacity-40`} /></label>
                <label className="text-xs text-gray-400">Default items<input type="number" min={1} max={100} value={settings.defaultMaxItems} onChange={(e) => setSettings({ ...settings, defaultMaxItems: Number(e.target.value) })} className={`${INPUT} mt-1`} /></label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Toggle checked={settings.backfillRecentReleases} label="Backfill recent releases to keep the shelf full" onChange={(checked) => setSettings({ ...settings, backfillRecentReleases: checked })} /><button onClick={saveSettings} disabled={busy === "settings"} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-gray-950">Save settings</button></div>
        </section>}

        {setupOpen && <section className="rounded-xl border border-brand-500/30 bg-gray-900 p-5">
            <h2 className="font-semibold text-white">Add recommended shelves</h2><p className="mt-1 text-sm text-gray-400">Choose the libraries and platforms you want represented. Shelves are created disabled so nothing appears in Plex until you review it.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-xs text-gray-400">Movie library<select value={setup.movieSectionId} onChange={(e) => setSetup({ ...setup, movieSectionId: e.target.value })} className={`${INPUT} mt-1`}><option value="">Choose…</option>{movieSections.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}</select></label>
                <label className="text-xs text-gray-400">TV library<select value={setup.showSectionId} onChange={(e) => setSetup({ ...setup, showSectionId: e.target.value })} className={`${INPUT} mt-1`}><option value="">Choose…</option>{showSections.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}</select></label>
            </div><div className="mt-4"><p className="mb-2 text-xs text-gray-400">Streaming platforms</p><div className="flex flex-wrap gap-2">{PROVIDERS.map((provider) => <button key={provider} onClick={() => setSetup({ ...setup, providers: setup.providers.includes(provider) ? setup.providers.filter((p) => p !== provider) : [...setup.providers, provider] })} className={cn("rounded-full border px-3 py-1.5 text-xs", setup.providers.includes(provider) ? "border-brand-500/50 bg-brand-500/15 text-brand-300" : "border-gray-700 text-gray-500 hover:text-gray-300")}>{provider}</button>)}</div></div>
            <div className="mt-5 flex justify-end"><button onClick={createDefaults} disabled={busy === "setup"} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-gray-950 disabled:opacity-50">Create disabled shelves</button></div>
        </section>}

        <section className="rounded-xl border border-gray-800 bg-gray-900/70 p-4">
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4"><div><h2 className="font-semibold text-white">Your shelf lineup</h2><p className="mt-0.5 text-xs text-gray-400">{published} of {settings.shelfLimit} Home slots selected · rows beyond the limit stay unpublished</p></div></div>
            {isLoading ? <div className="flex h-52 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div> : shelves.length === 0 ? <div className="py-16 text-center"><Clapperboard className="mx-auto h-8 w-8 text-gray-700" /><p className="mt-3 text-sm text-gray-400">No shelves configured yet.</p><button onClick={() => setSetupOpen(true)} className="mt-3 text-sm text-brand-400 hover:text-brand-300">Add the recommended lineup →</button></div> : <div className="mt-4 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"><div className="space-y-2">{shelves.map((shelf, index) => {
                const overBudget = shelf.enabled && shelf.publishToHome && shelves.filter((candidate) => candidate.enabled && candidate.publishToHome && (candidate.homePriority < shelf.homePriority || candidate.homePriority === shelf.homePriority && candidate.id <= shelf.id)).length > settings.shelfLimit;
                return <div key={shelf.id} className={cn("rounded-lg border transition-colors", selected === shelf.id ? "border-brand-500/40 bg-brand-500/5" : "border-gray-800 bg-gray-950/30", !shelf.enabled && "opacity-65")}>
                    <div className="flex items-center gap-2 p-3">
                        <div className="flex items-center gap-1"><GripVertical className="mr-1 h-4 w-4 text-gray-700" /><div className="flex flex-col"><button onClick={() => moveShelf(index, -1)} disabled={index === 0 || busy === shelf.id} className="text-gray-500 hover:text-white disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><button onClick={() => moveShelf(index, 1)} disabled={index === shelves.length - 1 || busy === shelf.id} className="text-gray-500 hover:text-white disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button></div></div>
                        <button onClick={() => setSelected(shelf.id)} className="min-w-0 flex-1 text-left"><div className="flex items-center gap-2">{shelf.mediaType === "MOVIE" ? <Film className="h-4 w-4 text-brand-400" /> : <Tv2 className="h-4 w-4 text-brand-400" />}<h3 className="truncate text-sm font-semibold text-white">{shelf.name}</h3></div><p className="mt-1 truncate text-[11px] text-gray-500">{shelf.itemCount}/{shelf.maxItems} titles · {SHELF_LABELS[shelf.shelfType]}{overBudget ? " · beyond Home limit" : ""}</p></button>
                        <Toggle checked={shelf.publishToHome} disabled={!shelf.enabled} label="" onChange={(checked) => patchShelf(shelf, { publishToHome: checked, ...(!checked ? { publishToSharedHome: false } : {}) })} />
                    </div>
                </div>;
            })}</div><div className="min-w-0">{selectedShelf && <><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div className="flex gap-4"><Toggle checked={selectedShelf.enabled} label="Maintain" onChange={(checked) => patchShelf(selectedShelf, { enabled: checked })}/><Toggle checked={selectedShelf.publishToSharedHome} disabled={!selectedShelf.enabled || !selectedShelf.publishToHome} label="Share" onChange={(checked) => patchShelf(selectedShelf, { publishToSharedHome: checked })}/></div><div className="flex items-center gap-2"><label className="text-xs text-gray-500">Target <input type="number" min={1} max={100} defaultValue={selectedShelf.maxItems} onBlur={(e) => patchShelf(selectedShelf, { maxItems: Number(e.target.value), maxItemsPerProvider: Number(e.target.value) })} className="ml-1 w-14 rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-white"/></label><button onClick={() => removeShelf(selectedShelf)} className="p-1.5 text-gray-600 hover:text-red-400"><Trash2 className="h-4 w-4"/></button></div></div><ShelfPreview shelf={selectedShelf} onChanged={() => mutate()} onRename={async (name) => { await patchShelf(selectedShelf, { name }, "Shelf title saved"); }}/></>}</div></div>}
        </section>
        <p className="px-1 text-xs leading-relaxed text-gray-500">Watch Warden only changes collections it created and tracks. Plex decides where these rows sit relative to its own Home sections.</p>
    </div>;
}
