import type { ScoreWeights } from "@watchwarden/types";

export const DEFAULT_WEIGHTS: ScoreWeights = {
    externalTrendScore: 0.45,
    localInterestScore: 0.35,
    freshnessScore: 0.1,
    editorialBoost: 0.1,
};

/** Validates that weights sum to approximately 1 (±0.01 tolerance). */
export function validateWeights(weights: ScoreWeights): void {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.01) {
        throw new Error(
            `Score weights must sum to 1.0 (got ${sum.toFixed(3)}). ` +
            `Received: ${JSON.stringify(weights)}`
        );
    }
}
