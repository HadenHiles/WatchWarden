"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import {
    ArrowLeft, ArrowRight, Check, CheckCheck, Film, Layers3, Loader2,
    RotateCcw, SlidersHorizontal, Sparkles, Tag, Tv2, X, XCircle,
} from "lucide-react";
import { apiUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Shelf { id: string; name: string; mediaType: "MOVIE" | "SHOW"; enabled: boolean }
interface RawCandidate {
    id: string; title: string; year: number | null; mediaType: "MOVIE" | "SHOW";
    posterPath: string | null; backdropPath: string | null; overview: string | null;
    genres: string[]; streamingOn: string[];
    suggestion: { id: string; finalScore: number; scoreExplanation: string | null; suggestedReasons: string[] } | null;
    trendSignals: Array<{ source: string; region: string | null; trendScore: number; providerId: string | null; providerRank: number | null; snapshotAt: string }>;
}
interface Candidate extends RawCandidate { shelves: Shelf[] }
type Decision = { title: string; titleId: string; action: "APPROVE" | "REJECT"; shelfIds: string[] };

const fetcher = async (urls: string[]) => Promise.all(urls.map(async (url) => {
    const response = await fetch(url, { credentials: "include" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not load review queue");
    return body.data as RawCandidate[];
}));

function candidateStrength(candidate: Candidate) {
    const scored = (candidate.suggestion?.finalScore ?? 0) * 100;
    const bestProviderRank = Math.min(...candidate.trendSignals.map((signal) => signal.providerRank ?? 999));
    const platformStrength = bestProviderRank < 999 ? Math.max(55, 100 - (bestProviderRank - 1) * 3) : 0;
    const trendStrength = Math.max(0, ...candidate.trendSignals.map((signal) => signal.trendScore * 100));
    return Math.round(Math.max(scored, platformStrength, trendStrength));
}

function candidateReason(candidate: Candidate) {
    const ranked = candidate.trendSignals
        .filter((signal) => signal.providerRank != null)
        .sort((a, b) => a.providerRank! - b.providerRank!)[0];
    const rankedShelf = candidate.shelves.find((shelf) => shelf.name.toLocaleLowerCase().includes("popular on"));
    const score = candidate.suggestion?.finalScore ?? 0;
    if (ranked && rankedShelf) {
        const region = ranked.region ? ` in ${ranked.region}` : "";
        return `Currently #${ranked.providerRank} for ${rankedShelf.name}${region}. Watch Warden matched that live platform signal to ${candidate.shelves.length === 1 ? "this shelf" : `${candidate.shelves.length} shelves`}.`;
    }
    if (score > 0.005 && candidate.suggestion?.scoreExplanation) return candidate.suggestion.scoreExplanation;
    if (candidate.suggestion?.suggestedReasons.length) return candidate.suggestion.suggestedReasons.join(" · ");
    return `Matched to ${candidate.shelves.map((shelf) => shelf.name).join(" and ")} from current discovery signals.`;
}

export function PlexCurationQueue({ shelves, onChanged }: { shelves: Shelf[]; onChanged: () => void }) {
    const activeShelves = useMemo(() => shelves.filter((shelf) => shelf.enabled), [shelves]);
    const urls = useMemo(() => activeShelves.map((shelf) => apiUrl(`/plex/collections/${shelf.id}/candidates`)), [activeShelves]);
    const { data, error, isLoading, mutate } = useSWR(urls.length ? urls : null, fetcher, { revalidateOnFocus: false });
    const [genre, setGenre] = useState("All");
    const [media, setMedia] = useState<"ALL" | "MOVIE" | "SHOW">("ALL");
    const [index, setIndex] = useState(0);
    const [selectedShelves, setSelectedShelves] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [bulkAction, setBulkAction] = useState<"APPROVE" | "REJECT" | null>(null);
    const [lastDecision, setLastDecision] = useState<Decision | null>(null);
    const [reviewedCount, setReviewedCount] = useState(0);
    const [dragX, setDragX] = useState(0);
    const dragStart = useRef<number | null>(null);

    const candidates = useMemo(() => {
        const merged = new Map<string, Candidate>();
        (data ?? []).forEach((list, shelfIndex) => list.forEach((candidate) => {
            const existing = merged.get(candidate.id);
            if (existing) existing.shelves.push(activeShelves[shelfIndex]);
            else merged.set(candidate.id, { ...candidate, shelves: [activeShelves[shelfIndex]] });
        }));
        return [...merged.values()].sort((a, b) =>
            candidateStrength(b) - candidateStrength(a) || b.shelves.length - a.shelves.length || a.title.localeCompare(b.title));
    }, [data, activeShelves]);

    const genres = useMemo(() => {
        const counts = new Map<string, number>();
        candidates.forEach((candidate) => candidate.genres.forEach((item) => counts.set(item, (counts.get(item) ?? 0) + 1)));
        return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    }, [candidates]);
    const filtered = useMemo(() => candidates.filter((candidate) =>
        (genre === "All" || candidate.genres.includes(genre)) && (media === "ALL" || candidate.mediaType === media)), [candidates, genre, media]);
    const current = filtered[Math.min(index, Math.max(0, filtered.length - 1))];

    useEffect(() => { setIndex(0); }, [genre, media]);
    useEffect(() => { if (current) setSelectedShelves(current.shelves.map((shelf) => shelf.id)); }, [current?.id]);

    const decide = useCallback(async (candidate: Candidate, action: "APPROVE" | "REJECT", shelfIds = selectedShelves) => {
        if (busy || (action === "APPROVE" && shelfIds.length === 0)) return;
        setBusy(true);
        try {
            const response = await fetch(apiUrl(`/plex/home/review/${candidate.id}`), {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, selectedShelfIds: action === "APPROVE" ? shelfIds : [], proposedShelfIds: candidate.shelves.map((shelf) => shelf.id) }),
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error ?? "Could not save decision");
            setLastDecision({ title: candidate.title, titleId: candidate.id, action, shelfIds: candidate.shelves.map((shelf) => shelf.id) });
            setReviewedCount((count) => count + 1);
            setDragX(action === "APPROVE" ? 600 : -600);
            window.setTimeout(() => setDragX(0), 180);
            await mutate(); onChanged();
        } finally { setBusy(false); }
    }, [busy, selectedShelves, mutate, onChanged]);

    async function undo() {
        if (!lastDecision || busy) return;
        setBusy(true);
        try {
            const response = await fetch(apiUrl(`/plex/home/review/${lastDecision.titleId}`), {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "UNDO", proposedShelfIds: lastDecision.shelfIds, selectedShelfIds: [] }),
            });
            if (!response.ok) throw new Error("Could not undo decision");
            setLastDecision(null); setReviewedCount((count) => Math.max(0, count - 1)); await mutate(); onChanged();
        } finally { setBusy(false); }
    }

    async function runBulk(action: "APPROVE" | "REJECT") {
        const batch = filtered.filter((candidate) => genre !== "All" && candidate.genres.includes(genre));
        setBulkAction(null); setBusy(true);
        try {
            for (const candidate of batch) {
                const response = await fetch(apiUrl(`/plex/home/review/${candidate.id}`), {
                    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action, selectedShelfIds: action === "APPROVE" ? candidate.shelves.map((shelf) => shelf.id) : [], proposedShelfIds: candidate.shelves.map((shelf) => shelf.id) }),
                });
                if (!response.ok) throw new Error(`Stopped at ${candidate.title}`);
            }
            setReviewedCount((count) => count + batch.length);
            await mutate(); onChanged();
        } finally { setBusy(false); }
    }

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (!current || busy || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return;
            if (event.key === "ArrowLeft" || event.key.toLowerCase() === "x") void decide(current, "REJECT");
            if (event.key === "ArrowRight" || event.key.toLowerCase() === "a") void decide(current, "APPROVE");
            if (event.key.toLowerCase() === "u") void undo();
        };
        window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
    }, [current, busy, decide, lastDecision]);

    const progress = reviewedCount + candidates.length ? Math.round((reviewedCount / (reviewedCount + candidates.length)) * 100) : 100;
    return <section className="overflow-hidden rounded-2xl border border-brand-500/20 bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.10),_transparent_45%),linear-gradient(145deg,rgba(17,24,39,.96),rgba(3,7,18,.98))] shadow-2xl shadow-black/20">
        <div className="border-b border-white/5 px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div><div className="flex items-center gap-2"><span className="rounded-lg bg-brand-500/15 p-2"><Sparkles className="h-4 w-4 text-brand-300" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-brand-400">Decision queue</p><h2 className="text-lg font-semibold text-white">Curate what your home sees next</h2></div></div><p className="mt-2 max-w-2xl text-xs leading-relaxed text-gray-400">Swipe, use the arrows, or press A / X. Every approval is routed to Jellyseerr for your final approval.</p></div>
                <div className="flex items-center gap-3"><div className="text-right"><p className="text-2xl font-bold tabular-nums text-white">{filtered.length}</p><p className="text-[10px] uppercase tracking-wider text-gray-500">left to review</p></div><div className="h-10 w-px bg-gray-800"/><button onClick={undo} disabled={!lastDecision || busy} className="flex items-center gap-2 rounded-xl border border-gray-700/80 px-3 py-2 text-xs text-gray-400 hover:border-gray-500 hover:text-white disabled:opacity-30"><RotateCcw className="h-3.5 w-3.5"/>Undo</button></div>
            </div>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-gray-800"><div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all" style={{ width: `${Math.max(4, progress)}%` }}/></div>
        </div>

        <div className="grid lg:grid-cols-[230px_minmax(0,1fr)]">
            <aside className="border-b border-white/5 p-4 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-300"><SlidersHorizontal className="h-3.5 w-3.5"/>Focus the queue</div>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-950/70 p-1 lg:grid-cols-1">
                    {([['ALL', 'Everything'], ['MOVIE', 'Movies'], ['SHOW', 'Shows']] as const).map(([value, label]) => <button key={value} onClick={() => setMedia(value)} className={cn("flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs lg:justify-start", media === value ? "bg-gray-800 text-white shadow" : "text-gray-500 hover:text-gray-300")}>{value === "MOVIE" ? <Film className="h-3.5 w-3.5"/> : value === "SHOW" ? <Tv2 className="h-3.5 w-3.5"/> : <Layers3 className="h-3.5 w-3.5"/>}{label}</button>)}
                </div>
                <div className="mt-5 flex items-center justify-between"><span className="flex items-center gap-1.5 text-xs font-semibold text-gray-300"><Tag className="h-3.5 w-3.5"/>Genres</span>{genre !== "All" && <button onClick={() => setGenre("All")} className="text-[10px] text-brand-400">Clear</button>}</div>
                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1">
                    <button onClick={() => setGenre("All")} className={cn("flex w-full justify-between rounded-lg px-2.5 py-2 text-xs", genre === "All" ? "bg-brand-500/12 text-brand-300" : "text-gray-500 hover:bg-gray-800/60 hover:text-gray-300")}><span>All genres</span><span>{candidates.length}</span></button>
                    {genres.map(([item, count]) => <button key={item} onClick={() => setGenre(item)} className={cn("flex w-full justify-between rounded-lg px-2.5 py-2 text-xs", genre === item ? "bg-brand-500/12 text-brand-300" : "text-gray-500 hover:bg-gray-800/60 hover:text-gray-300")}><span className="truncate">{item}</span><span>{count}</span></button>)}
                </div>
                {genre !== "All" && filtered.length > 0 && <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/45 p-3"><p className="text-[11px] text-gray-400">Decide all <span className="font-semibold text-white">{filtered.length} {genre}</span> titles</p><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => setBulkAction("REJECT")} className="rounded-lg border border-red-500/25 px-2 py-2 text-[10px] font-semibold text-red-400 hover:bg-red-500/10"><XCircle className="mx-auto mb-1 h-3.5 w-3.5"/>Reject all</button><button onClick={() => setBulkAction("APPROVE")} className="rounded-lg border border-emerald-500/25 px-2 py-2 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/10"><CheckCheck className="mx-auto mb-1 h-3.5 w-3.5"/>Approve all</button></div></div>}
            </aside>

            <div className="relative flex min-h-[590px] items-center justify-center overflow-hidden p-4 sm:p-7">
                {isLoading ? <div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-brand-400"/><p className="mt-3 text-xs text-gray-500">Building your review deck…</p></div> : error ? <p className="text-sm text-red-400">{error.message}</p> : !current ? <div className="max-w-sm text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"><CheckCheck className="h-7 w-7 text-emerald-400"/></div><h3 className="mt-4 text-xl font-semibold text-white">Queue cleared</h3><p className="mt-2 text-sm leading-relaxed text-gray-500">Nothing else matches these filters. Automations will keep discovering fresh candidates.</p></div> : <div className="w-full max-w-3xl">
                    <div
                        onPointerDown={(event) => { dragStart.current = event.clientX; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }}
                        onPointerMove={(event) => { if (dragStart.current != null) setDragX(event.clientX - dragStart.current); }}
                        onPointerUp={() => { const amount = dragX; dragStart.current = null; if (Math.abs(amount) > 110) void decide(current, amount > 0 ? "APPROVE" : "REJECT"); else setDragX(0); }}
                        style={{ transform: `translateX(${dragX}px) rotate(${dragX / 35}deg)`, opacity: Math.max(.35, 1 - Math.abs(dragX) / 700) }}
                        className="relative touch-pan-y overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl transition-[transform,opacity] duration-150">
                        {current.backdropPath && <div className="absolute inset-x-0 top-0 h-56 bg-cover bg-center opacity-25 [mask-image:linear-gradient(to_bottom,black,transparent)]" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w780${current.backdropPath})` }}/>} 
                        <div className="relative grid gap-5 p-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:p-6">
                            <div>{current.posterPath ? <img src={`https://image.tmdb.org/t/p/w342${current.posterPath}`} alt="" className="aspect-[2/3] w-full rounded-xl bg-gray-800 object-cover shadow-xl"/> : <div className="flex aspect-[2/3] items-center justify-center rounded-xl bg-gray-800"><Film className="h-8 w-8 text-gray-600"/></div>}<div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-gray-600"><ArrowLeft className="h-3 w-3"/>drag to decide<ArrowRight className="h-3 w-3"/></div></div>
                            <div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-300">{current.mediaType === "MOVIE" ? "Movie" : "Series"}</span>{current.streamingOn.slice(0, 3).map((provider) => <span key={provider} className="rounded-full bg-purple-500/10 px-2.5 py-1 text-[10px] text-purple-300">{provider}</span>)}</div><h3 className="mt-3 text-2xl font-bold tracking-tight text-white">{current.title}</h3><p className="mt-1 text-sm text-gray-500">{current.year ?? "Year unknown"} · {candidateStrength(current)}/100 signal strength</p><p className="mt-4 line-clamp-4 text-sm leading-6 text-gray-300">{current.overview || "No synopsis is available yet."}</p>
                                <div className="mt-4 flex flex-wrap gap-1.5">{current.genres.map((item) => <button key={item} onClick={() => setGenre(item)} className="rounded-full border border-gray-700/80 px-2.5 py-1 text-[10px] text-gray-400 hover:border-brand-500/50 hover:text-brand-300">{item}</button>)}</div>
                                <div className="mt-5 rounded-xl border border-brand-500/15 bg-brand-950/15 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-brand-400">Why Watch Warden picked it</p><p className="mt-1.5 text-xs leading-relaxed text-gray-400">{candidateReason(current)}</p></div>
                                <div className="mt-5"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-white">Suggested shelves</p><span className="text-[10px] text-gray-500">Choose where it belongs</span></div><div className="space-y-2">{current.shelves.map((shelf) => { const checked = selectedShelves.includes(shelf.id); return <button key={shelf.id} onClick={() => setSelectedShelves(checked ? selectedShelves.filter((id) => id !== shelf.id) : [...selectedShelves, shelf.id])} className={cn("flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left", checked ? "border-brand-500/35 bg-brand-500/8" : "border-gray-800 bg-gray-950/30 opacity-60")}><span className={cn("flex h-5 w-5 items-center justify-center rounded-md border", checked ? "border-brand-400 bg-brand-500 text-gray-950" : "border-gray-600")} >{checked && <Check className="h-3.5 w-3.5"/>}</span><span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-200">{shelf.name}</span>{shelf.mediaType === "MOVIE" ? <Film className="h-3.5 w-3.5 text-gray-600"/> : <Tv2 className="h-3.5 w-3.5 text-gray-600"/>}</button>; })}</div></div>
                            </div>
                        </div>
                        {dragX < -40 && <div className="pointer-events-none absolute left-7 top-7 -rotate-6 rounded-xl border-2 border-red-400 px-4 py-2 text-xl font-black uppercase tracking-widest text-red-400">Reject</div>}{dragX > 40 && <div className="pointer-events-none absolute right-7 top-7 rotate-6 rounded-xl border-2 border-emerald-400 px-4 py-2 text-xl font-black uppercase tracking-widest text-emerald-400">Approve</div>}
                    </div>
                    <div className="mt-5 flex items-center justify-center gap-4"><button onClick={() => void decide(current, "REJECT")} disabled={busy} className="group flex h-14 w-14 items-center justify-center rounded-full border border-red-500/30 bg-red-500/8 text-red-400 shadow-lg hover:scale-105 hover:bg-red-500/15 disabled:opacity-40" title="Reject (← or X)"><X className="h-6 w-6"/></button><div className="hidden text-center sm:block"><p className="text-[10px] uppercase tracking-widest text-gray-600">{Math.min(index + 1, filtered.length)} of {filtered.length}</p><button onClick={() => setIndex((value) => Math.min(value + 1, filtered.length - 1))} className="mt-1 text-[10px] text-gray-500 hover:text-gray-300">Skip for now</button></div><button onClick={() => void decide(current, "APPROVE")} disabled={busy || selectedShelves.length === 0} className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/8 text-emerald-400 shadow-lg hover:scale-105 hover:bg-emerald-500/15 disabled:opacity-40" title="Approve (→ or A)">{busy ? <Loader2 className="h-5 w-5 animate-spin"/> : <Check className="h-6 w-6"/>}</button></div>
                </div>}
            </div>
        </div>
        {bulkAction && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl"><div className={cn("flex h-11 w-11 items-center justify-center rounded-full", bulkAction === "APPROVE" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400")}>{bulkAction === "APPROVE" ? <CheckCheck className="h-5 w-5"/> : <XCircle className="h-5 w-5"/>}</div><h3 className="mt-4 text-lg font-semibold text-white">{bulkAction === "APPROVE" ? "Approve" : "Reject"} all {genre} titles?</h3><p className="mt-2 text-sm leading-relaxed text-gray-400">This will apply to <strong className="text-white">{filtered.length} titles</strong>{bulkAction === "APPROVE" ? " and all of their suggested shelves. Each missing title will still wait for your final approval in Jellyseerr." : ". They will leave every curation queue."}</p><div className="mt-5 max-h-32 overflow-y-auto rounded-lg bg-gray-950/60 p-3 text-xs text-gray-500">{filtered.map((item) => item.title).join(" · ")}</div><div className="mt-5 flex justify-end gap-2"><button onClick={() => setBulkAction(null)} className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300">Cancel</button><button onClick={() => void runBulk(bulkAction)} className={cn("rounded-lg px-4 py-2 text-sm font-semibold", bulkAction === "APPROVE" ? "bg-emerald-500 text-gray-950" : "bg-red-500 text-white")}>Confirm {filtered.length}</button></div></div></div>}
    </section>;
}
