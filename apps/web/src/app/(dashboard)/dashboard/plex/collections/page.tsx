"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { AlertCircle, Check, ChevronDown, ChevronUp, Clapperboard, Film, GripVertical, Loader2, Plus, RefreshCw, Search, Settings2, Trash2, Tv2, X } from "lucide-react";
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
    shelfType: "CULTURAL_TRENDING" | "PROVIDER_TRENDING" | "RECENTLY_RELEASED" | "SMART" | "CUSTOM";
    provider: string | null; collectionType: "SMART" | "TOP_TRENDING"; streamingProviders: string[];
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

const SHELF_LABELS: Record<Shelf["shelfType"], string> = {
    CULTURAL_TRENDING: "Cultural",
    PROVIDER_TRENDING: "Platform",
    RECENTLY_RELEASED: "Recent releases",
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
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Array<{ id: string; title: string; year: number | null }>>([]);
    const [name, setName] = useState(shelf.name);
    const [renaming, setRenaming] = useState(false);

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

    const items = data?.data ?? [];
    return (
        <div className="border-t border-gray-800/80 bg-gray-950/35 p-4 space-y-4">
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
            {isLoading ? <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div> : items.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-800 py-10 text-center text-sm text-gray-500">No local matches yet. Run a trend and Plex sync to populate this shelf.</div>
            ) : <div className="flex gap-3 overflow-x-auto pb-2">
                {items.map((item) => {
                    const rank = item.trendSnapshots.find((snapshot) => snapshot.providerRank)?.providerRank;
                    const heat = Math.round(Math.max(0, ...item.trendSnapshots.map((snapshot) => snapshot.trendScore)) * 100);
                    return <div key={item.id} className="group relative w-24 flex-none">
                        {item.posterPath ? <img src={`https://image.tmdb.org/t/p/w185${item.posterPath}`} alt="" className="aspect-[2/3] w-full rounded-lg bg-gray-800 object-cover" /> : <div className="flex aspect-[2/3] items-center justify-center rounded-lg bg-gray-800"><Film className="h-5 w-5 text-gray-600" /></div>}
                        <button onClick={() => override(item.id, "exclude")} title="Exclude from this shelf" className="absolute right-1 top-1 rounded-full bg-gray-950/90 p-1 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-400"><X className="h-3 w-3" /></button>
                        <p className="mt-1 truncate text-xs font-medium text-gray-200">{item.title}</p>
                        <p className="text-[11px] text-gray-500">{rank ? `Platform #${rank}` : `Heat ${heat}`}{item.manuallyAdded ? " · Added" : ""}</p>
                    </div>;
                })}
            </div>}
        </div>
    );
}

export default function PlexHomePage() {
    const { data, error, mutate, isLoading } = useSWR<{ data: HomeResponse }>(apiUrl("/plex/home"), fetcher);
    const { data: sectionData } = useSWR<{ data: PlexSection[] }>(apiUrl("/plex/sections"), fetcher);
    const shelves = useMemo(() => [...(data?.data.shelves ?? [])].sort((a, b) => a.homePriority - b.homePriority || a.id.localeCompare(b.id)), [data]);
    const sections = sectionData?.data ?? [];
    const movieSections = sections.filter((section) => section.type === "movie");
    const showSections = sections.filter((section) => section.type === "show");
    const [expanded, setExpanded] = useState<string | null>(null);
    const [setupOpen, setSetupOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
    const [settings, setSettings] = useState<HomeSettings>({ primaryRegion: "CA", fallbackRegion: "US", shelfLimit: 6, recentlyReleasedDays: 90, backfillRecentReleases: true, recentlyReleasedBackfillDays: 365, defaultMaxItems: 20 });
    const [setup, setSetup] = useState({ movieSectionId: "", showSectionId: "", providers: ["Netflix", "Disney+", "Prime Video", "Apple TV+"] });

    useEffect(() => { if (data?.data.settings) setSettings(data.data.settings); }, [data]);
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

        <section className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/70">
            <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4"><div><h2 className="font-semibold text-white">Your shelf lineup</h2><p className="mt-0.5 text-xs text-gray-400">{published} of {settings.shelfLimit} Home slots selected · rows beyond the limit stay unpublished</p></div></div>
            {isLoading ? <div className="flex h-52 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-500" /></div> : shelves.length === 0 ? <div className="py-16 text-center"><Clapperboard className="mx-auto h-8 w-8 text-gray-700" /><p className="mt-3 text-sm text-gray-400">No shelves configured yet.</p><button onClick={() => setSetupOpen(true)} className="mt-3 text-sm text-brand-400 hover:text-brand-300">Add the recommended lineup →</button></div> : shelves.map((shelf, index) => {
                const overBudget = shelf.enabled && shelf.publishToHome && shelves.filter((candidate) => candidate.enabled && candidate.publishToHome && (candidate.homePriority < shelf.homePriority || candidate.homePriority === shelf.homePriority && candidate.id <= shelf.id)).length > settings.shelfLimit;
                return <div key={shelf.id} className={cn("border-b border-gray-800/80 last:border-b-0", !shelf.enabled && "opacity-65")}>
                    <div className="grid gap-4 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
                        <div className="flex items-center gap-1"><GripVertical className="mr-1 h-4 w-4 text-gray-700" /><div className="flex flex-col"><button onClick={() => moveShelf(index, -1)} disabled={index === 0 || busy === shelf.id} className="text-gray-500 hover:text-white disabled:opacity-20"><ChevronUp className="h-4 w-4" /></button><button onClick={() => moveShelf(index, 1)} disabled={index === shelves.length - 1 || busy === shelf.id} className="text-gray-500 hover:text-white disabled:opacity-20"><ChevronDown className="h-4 w-4" /></button></div></div>
                        <button onClick={() => setExpanded(expanded === shelf.id ? null : shelf.id)} className="min-w-0 text-left"><div className="flex items-center gap-2"><span className="text-xs tabular-nums text-gray-500">{index + 1}</span>{shelf.mediaType === "MOVIE" ? <Film className="h-4 w-4 text-brand-400" /> : <Tv2 className="h-4 w-4 text-brand-400" />}<h3 className="truncate text-sm font-semibold text-white">{shelf.name}</h3><span className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-400">{SHELF_LABELS[shelf.shelfType]}</span>{overBudget && <span className="rounded-full bg-amber-950/50 px-2 py-0.5 text-[11px] text-amber-400">Beyond Home limit</span>}</div><p className="mt-1 text-xs text-gray-400">{shelf.itemCount} local titles · {shelf.lastSyncAt ? `synced ${new Date(shelf.lastSyncAt).toLocaleString()}` : "not synced yet"}</p></button>
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 md:justify-end">
                            <Toggle checked={shelf.enabled} label="Maintain shelf" onChange={(checked) => patchShelf(shelf, { enabled: checked }, checked ? "Shelf enabled" : "Shelf disabled")} />
                            <Toggle checked={shelf.publishToHome} disabled={!shelf.enabled} label="Show on Home" onChange={(checked) => patchShelf(shelf, { publishToHome: checked, ...(!checked ? { publishToSharedHome: false } : {}) })} />
                            <Toggle checked={shelf.publishToSharedHome} disabled={!shelf.enabled || !shelf.publishToHome} label="Share with users" onChange={(checked) => patchShelf(shelf, { publishToSharedHome: checked })} />
                            <label className="flex items-center gap-2 text-xs text-gray-400">Items<input type="number" min={1} max={100} defaultValue={shelf.maxItems} onBlur={(e) => patchShelf(shelf, { maxItems: Number(e.target.value), maxItemsPerProvider: Number(e.target.value) })} className="w-16 rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-white" /></label>
                            <button onClick={() => removeShelf(shelf)} title="Stop managing shelf" className="rounded-md p-1.5 text-gray-600 hover:bg-red-950/30 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
                            <button onClick={() => setExpanded(expanded === shelf.id ? null : shelf.id)} className="text-gray-500 hover:text-white">{expanded === shelf.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                        </div>
                    </div>{expanded === shelf.id && <ShelfPreview shelf={shelf} onChanged={() => mutate()} onRename={async (name) => { await patchShelf(shelf, { name }, "Shelf title saved"); }} />}
                </div>;
            })}
        </section>
        <p className="px-1 text-xs leading-relaxed text-gray-500">Watch Warden only changes collections it created and tracks. Plex decides where these rows sit relative to its own Home sections.</p>
    </div>;
}
