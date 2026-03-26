"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SuggestionsPage } from "@/components/SuggestionsPage";

function SuggestionsContent() {
    const router = useRouter();
    const params = useSearchParams();
    const tab = params.get("tab") === "shows" ? "shows" : "movies";

    function setTab(t: "movies" | "shows") {
        const next = new URLSearchParams(params.toString());
        next.set("tab", t);
        router.replace(`/dashboard/suggestions?${next.toString()}`);
    }

    return (
        <div className="space-y-5 max-w-3xl">
            {/* Tab switcher */}
            <div className="flex gap-1.5">
                {(["movies", "shows"] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`text-sm px-4 py-2 rounded-lg border transition-all font-medium ${tab === t
                                ? "bg-brand-500/10 border-brand-500/30 text-brand-400"
                                : "bg-gray-800/60 border-gray-700/60 text-gray-500 hover:text-gray-200 hover:border-gray-600"
                            }`}
                    >
                        {t === "movies" ? "Movies" : "TV Shows"}
                    </button>
                ))}
            </div>
            <SuggestionsPage mediaType={tab === "movies" ? "MOVIE" : "SHOW"} hideHeading />
        </div>
    );
}

export default function CombinedSuggestionsPage() {
    return (
        <Suspense>
            <SuggestionsContent />
        </Suspense>
    );
}
