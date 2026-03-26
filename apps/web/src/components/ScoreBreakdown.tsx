import { formatScore, scoreColor } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ScoreBarProps {
    label: string;
    value: number;
    weight?: number;
}

function ScoreBar({ label, value, weight }: ScoreBarProps) {
    return (
        <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">{label}</span>
                <span className={cn("font-mono font-medium tabular-nums", scoreColor(value))}>
                    {formatScore(value)}{weight !== undefined ? ` × ${weight}` : ""}
                </span>
            </div>
            <div className="h-1 rounded-full bg-gray-800">
                <div
                    className="h-full rounded-full bg-brand-500/80 transition-all duration-500"
                    style={{ width: `${Math.min(100, value * 100)}%` }}
                />
            </div>
        </div>
    );
}

interface ScoreBreakdownProps {
    externalTrendScore: number;
    localInterestScore: number;
    freshnessScore: number;
    editorialBoost: number;
    finalScore: number;
    explanation?: string | null;
}

export function ScoreBreakdown({
    externalTrendScore,
    localInterestScore,
    freshnessScore,
    editorialBoost,
    finalScore,
    explanation,
}: ScoreBreakdownProps) {
    return (
        <div className="space-y-3 rounded-xl bg-gray-800/40 border border-gray-700/60 p-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Score Breakdown</h4>
                <span className={cn("text-xl font-bold tabular-nums", scoreColor(finalScore))}>
                    {formatScore(finalScore)}
                </span>
            </div>

            <div className="space-y-2.5">
                <ScoreBar label="External Trend" value={externalTrendScore} />
                <ScoreBar label="Local Interest" value={localInterestScore} />
                <ScoreBar label="Freshness" value={freshnessScore} />
                <ScoreBar label="Editorial Boost" value={editorialBoost} />
            </div>

            {explanation && (
                <p className="text-[11px] text-gray-600 border-t border-gray-700/60 pt-3 leading-relaxed">{explanation}</p>
            )}
        </div>
    );
}
