export interface CulturalHeatInput {
    tmdbTrend?: number | null;
    tmdbTrends?: Array<number | null | undefined>;
    rank?: number | null;
    snapshotAt: Date;
    region?: string | null;
}

export interface ShelfRankingConfig {
    freshnessHalfLifeHours: number;
    maxRank: number;
    primaryRegion: string;
    fallbackRegion: string;
}

export const DEFAULT_SHELF_RANKING_CONFIG: ShelfRankingConfig = {
    freshnessHalfLifeHours: 72,
    maxRank: 100,
    primaryRegion: "CA",
    fallbackRegion: "US",
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function freshnessScore(snapshotAt: Date, now: Date, halfLifeHours: number): number {
    const ageHours = Math.max(0, now.getTime() - snapshotAt.getTime()) / 3_600_000;
    return Math.pow(0.5, ageHours / Math.max(1, halfLifeHours));
}

export function regionPriority(region: string | null | undefined, config = DEFAULT_SHELF_RANKING_CONFIG): number {
    if (region === config.primaryRegion) return 0;
    if (region === config.fallbackRegion) return 1;
    return 2;
}

/** Cultural popularity only. Household/Tautulli fields are deliberately absent. */
export function culturalHeat(input: CulturalHeatInput, now = new Date(), config = DEFAULT_SHELF_RANKING_CONFIG): number {
    const availableTrends = (input.tmdbTrends ?? [input.tmdbTrend])
        .filter((score): score is number => typeof score === "number");
    const sourceHeat = availableTrends.length
        ? clamp(availableTrends.reduce((sum, score) => sum + clamp(score), 0) / availableTrends.length)
        : 0;
    const rankStrength = input.rank ? clamp(1 - (input.rank - 1) / config.maxRank) : 0;
    const freshness = freshnessScore(input.snapshotAt, now, config.freshnessHalfLifeHours);
    const regionWeight = regionPriority(input.region, config) === 0 ? 1 : regionPriority(input.region, config) === 1 ? 0.9 : 0.75;
    return clamp((sourceHeat * 0.45 + rankStrength * 0.35 + freshness * 0.2) * regionWeight);
}

export interface PlatformSnapshot {
    titleId: string;
    providerRank: number;
    region: string | null;
    snapshotAt: Date;
}

export interface ProviderHistorySnapshot {
    titleId: string;
    providerRank: number;
    snapshotAt: Date;
}

/** Ranks titles by sustained, recent provider-chart strength across a lookback window. */
export function rankProviderHistory(snapshots: ProviderHistorySnapshot[], now = new Date()): string[] {
    const scores = new Map<string, number>();
    for (const snapshot of snapshots) {
        const ageDays = Math.max(0, now.getTime() - snapshot.snapshotAt.getTime()) / 86_400_000;
        const score = Math.pow(0.5, ageDays / 7) / Math.sqrt(Math.max(1, snapshot.providerRank));
        scores.set(snapshot.titleId, (scores.get(snapshot.titleId) ?? 0) + score);
    }
    return [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}

export interface StreamingEditorialCandidate {
    id: string;
    providerRank: number;
    firstAirDate?: Date | null;
    lastAirDate?: Date | null;
    isNetflixOriginal: boolean;
    rankMomentum: number;
    stableDays: number;
}

/** Builds a streaming-style TV row from distinct editorial lanes. */
export function selectStreamingEditorialTitles(candidates: StreamingEditorialCandidate[], limit: number, now = new Date()): StreamingEditorialCandidate[] {
    const target = Math.max(0, limit);
    if (!target) return [];
    const rankScore = (item: StreamingEditorialCandidate) => 1 / Math.max(1, item.providerRank);
    const ageDays = (date?: Date | null) => date ? Math.max(0, now.getTime() - date.getTime()) / 86_400_000 : Number.POSITIVE_INFINITY;
    const freshness = (item: StreamingEditorialCandidate) => {
        const age = Math.min(ageDays(item.lastAirDate), ageDays(item.firstAirDate));
        return Number.isFinite(age) ? Math.max(0, 1 - age / 730) : 0;
    };
    const base = (item: StreamingEditorialCandidate) => rankScore(item) * 0.55 + freshness(item) * 0.3
        + (item.isNetflixOriginal ? 0.15 : 0) - (item.stableDays >= 35 ? 0.18 : 0);
    const recent = [...candidates].filter((item) => Math.min(ageDays(item.lastAirDate), ageDays(item.firstAirDate)) <= 365)
        .sort((a, b) => freshness(b) - freshness(a) || a.providerRank - b.providerRank);
    const originals = [...candidates].filter((item) => item.isNetflixOriginal)
        .sort((a, b) => base(b) - base(a) || a.providerRank - b.providerRank);
    const rising = [...candidates].filter((item) => item.rankMomentum > 0)
        .sort((a, b) => b.rankMomentum - a.rankMomentum || base(b) - base(a));
    const evergreen = [...candidates].sort((a, b) => base(b) - base(a) || a.providerRank - b.providerRank);

    const quotas = target >= 5
        ? [Math.round(target * 0.4), Math.floor(target * 0.3), Math.max(1, Math.floor(target * 0.1))]
        : [Math.ceil(target * 0.4), Math.floor(target * 0.3), 0];
    const evergreenQuota = Math.max(0, target - quotas.reduce((sum, value) => sum + value, 0));
    const selected: StreamingEditorialCandidate[] = [];
    const seen = new Set<string>();
    const take = (items: StreamingEditorialCandidate[], count: number) => {
        for (const item of items) {
            if (selected.length >= target || count <= 0) break;
            if (seen.has(item.id)) continue;
            seen.add(item.id); selected.push(item); count--;
        }
    };
    take(recent, quotas[0]);
    take(originals, quotas[1]);
    take(rising, quotas[2]);
    take(evergreen, evergreenQuota);
    take(evergreen, target - selected.length);
    return selected;
}

export function comparePlatformSnapshots(a: PlatformSnapshot, b: PlatformSnapshot, config = DEFAULT_SHELF_RANKING_CONFIG): number {
    return regionPriority(a.region, config) - regionPriority(b.region, config)
        || a.providerRank - b.providerRank
        || b.snapshotAt.getTime() - a.snapshotAt.getTime()
        || a.titleId.localeCompare(b.titleId);
}

/** Selects one deterministic primary/fallback snapshot per title without query limits. */
export function resolvePlatformSnapshots(snapshots: PlatformSnapshot[], config = DEFAULT_SHELF_RANKING_CONFIG): PlatformSnapshot[] {
    const best = new Map<string, PlatformSnapshot>();
    for (const snapshot of snapshots) {
        const current = best.get(snapshot.titleId);
        if (!current || comparePlatformSnapshots(snapshot, current, config) < 0) best.set(snapshot.titleId, snapshot);
    }
    return [...best.values()].sort((a, b) =>
        a.providerRank - b.providerRank
        || regionPriority(a.region, config) - regionPriority(b.region, config)
        || b.snapshotAt.getTime() - a.snapshotAt.getTime()
        || a.titleId.localeCompare(b.titleId));
}

export function selectPublishedShelfIds<T extends { id: string; enabled: boolean; publishToHome: boolean; homePriority: number }>(shelves: T[], limit: number): string[] {
    return shelves.filter((s) => s.enabled && s.publishToHome)
        .sort((a, b) => a.homePriority - b.homePriority || a.id.localeCompare(b.id))
        .slice(0, Math.max(0, limit)).map((s) => s.id);
}

/** Keeps a broad shelf distinct from a more specific, higher-priority shelf. */
export function diversifyShelf<T>(candidates: T[], priorityItems: Iterable<T>, limit: number, maxOverlapRatio = 0.25): T[] {
    const target = Math.max(0, limit);
    const priority = new Set(priorityItems);
    const overlapLimit = Math.floor(target * Math.max(0, Math.min(1, maxOverlapRatio)));
    const selected: T[] = [];
    const deferredOverlap: T[] = [];
    const seen = new Set<T>();
    let overlaps = 0;

    for (const candidate of candidates) {
        if (seen.has(candidate)) continue;
        seen.add(candidate);
        if (priority.has(candidate) && overlaps >= overlapLimit) {
            deferredOverlap.push(candidate);
            continue;
        }
        if (priority.has(candidate)) overlaps++;
        selected.push(candidate);
        if (selected.length === target) return selected;
    }
    // Thin libraries may need extra overlap to avoid a half-empty row.
    for (const candidate of deferredOverlap) {
        selected.push(candidate);
        if (selected.length === target) break;
    }
    return selected;
}

export function isRecentlyReleased(releaseDate: Date | null, now: Date, windowDays: number): boolean {
    if (!releaseDate) return false;
    const age = now.getTime() - releaseDate.getTime();
    return age >= 0 && age <= Math.max(1, windowDays) * 86_400_000;
}

/** Auto-request only young series; older shows remain explicit user requests. */
export function isAutoRequestEligibleShow(
    firstAirDate: Date | null,
    now: Date,
    windowDays = 730,
): boolean {
    const cutoff = new Date(now.getTime() - Math.max(1, windowDays) * 86_400_000);
    return firstAirDate instanceof Date
        && !Number.isNaN(firstAirDate.getTime())
        && firstAirDate >= cutoff;
}
