export function genreBalanceBoost(genres: string[], counts: Record<string, number>, weight = 0.15): number {
    const values = Object.values(counts).filter((value) => Number.isFinite(value) && value > 0);
    if (!genres.length || !values.length) return 1;
    const maximum = Math.max(...values);
    const gap = genres.reduce((sum, genre) => sum + 1 - Math.min(1, Math.max(0, counts[genre] ?? 0) / maximum), 0) / genres.length;
    return 1 + Math.max(0, Math.min(0.2, weight)) * gap;
}