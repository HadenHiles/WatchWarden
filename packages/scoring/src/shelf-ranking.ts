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
