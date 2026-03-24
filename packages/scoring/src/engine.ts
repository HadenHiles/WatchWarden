import type { ScoreWeights, ScoreBreakdown } from "@watchwarden/types";
import { DEFAULT_WEIGHTS, validateWeights } from "./weights";
import { evaluateRules, type RuleInput } from "./rules";

export interface ScoringInput {
    externalTrendScore: number;
    localInterestScore: number;
    freshnessScore: number;
    editorialBoost: number;
    rules: RuleInput;
    weights?: ScoreWeights;
}

export interface ScoringOutput {
    breakdown: ScoreBreakdown;
    excluded: boolean;
    explanation: string;
    reasons: string[];
}

/**
 * Core scoring engine.
 *
 * Formula:
 *   raw = Σ (component × weight)
 *   final = clamp(raw × ruleMultiplier, 0, 1)
 *
 * All inputs should be in the [0, 1] range.
 */
export function scoreTitle(input: ScoringInput): ScoringOutput {
    const weights = input.weights ?? DEFAULT_WEIGHTS;
    validateWeights(weights);

    const ruleResult = evaluateRules(input.rules);

    if (ruleResult.exclude) {
        return {
            breakdown: {
                externalTrendScore: input.externalTrendScore,
                localInterestScore: input.localInterestScore,
                freshnessScore: input.freshnessScore,
                editorialBoost: input.editorialBoost,
                finalScore: 0,
            },
            excluded: true,
            explanation: ruleResult.reasons.join(". "),
            reasons: ruleResult.reasons,
        };
    }

    const rawScore =
        input.externalTrendScore * weights.externalTrendScore +
        input.localInterestScore * weights.localInterestScore +
        input.freshnessScore * weights.freshnessScore +
        input.editorialBoost * weights.editorialBoost;

    const finalScore = Math.min(1, Math.max(0, rawScore * ruleResult.multiplier));

    const reasons = buildReasons(input, ruleResult.reasons);
    const explanation = buildExplanation(input, finalScore, ruleResult.reasons);

    return {
        breakdown: {
            externalTrendScore: input.externalTrendScore,
            localInterestScore: input.localInterestScore,
            freshnessScore: input.freshnessScore,
            editorialBoost: input.editorialBoost,
            finalScore,
        },
        excluded: false,
        explanation,
        reasons,
    };
}

function buildReasons(input: ScoringInput, ruleReasons: string[]): string[] {
    const reasons: string[] = [...ruleReasons];

    if (input.externalTrendScore > 0.6) reasons.push("Trending on external sources");
    if (input.localInterestScore > 0.5) reasons.push("High local family interest");
    if (input.rules.uniqueViewerCount >= 2) reasons.push("Multiple family members interested");
    if (input.freshnessScore > 0.7) reasons.push("Recently trending");
    if (input.editorialBoost > 0) reasons.push("Editorial boost applied");

    return [...new Set(reasons)];
}

function buildExplanation(input: ScoringInput, finalScore: number, ruleReasons: string[]): string {
    const pct = Math.round(finalScore * 100);
    const parts: string[] = [
        `Score ${pct}/100.`,
        `External trend: ${Math.round(input.externalTrendScore * 100)}%,`,
        `local interest: ${Math.round(input.localInterestScore * 100)}%,`,
        `freshness: ${Math.round(input.freshnessScore * 100)}%.`,
    ];
    if (ruleReasons.length) parts.push(`Notes: ${ruleReasons.join("; ")}.`);
    return parts.join(" ");
}
