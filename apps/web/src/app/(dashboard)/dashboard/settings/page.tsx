"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Save } from "lucide-react";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

// Keys must match the composite keys stored by the scoring engine and seed.
// score.weights stores { externalTrendScore, localInterestScore, freshnessScore, editorialBoost }
// exclusions stores { excludeInLibrary, excludeAlreadyRequested, excludePermanentlyRejected }
// retention.defaults stores { movies: {...}, shows: {...} }
const KNOWN_SETTINGS = [
    {
        section: "Scoring Weights",
        keys: [
            { key: "score.weights", subKey: "externalTrendScore", label: "External Trend Weight", type: "number" },
            { key: "score.weights", subKey: "localInterestScore", label: "Local Interest Weight", type: "number" },
            { key: "score.weights", subKey: "freshnessScore", label: "Freshness Weight", type: "number" },
            { key: "score.weights", subKey: "editorialBoost", label: "Editorial Boost Weight", type: "number" },
        ],
    },
    {
        section: "Exclusions",
        keys: [
            { key: "exclusions", subKey: "excludeInLibrary", label: "Exclude titles in library", type: "boolean" },
            { key: "exclusions", subKey: "excludeAlreadyRequested", label: "Exclude already requested", type: "boolean" },
            { key: "exclusions", subKey: "excludePermanentlyRejected", label: "Exclude permanently rejected", type: "boolean" },
        ],
    },
];

// API returns a flat object: { "score.weights": { externalTrendScore: 0.45, ... }, ... }
type SettingsData = Record<string, Record<string, unknown>>;

export default function SettingsPage() {
    const { data, mutate } = useSWR<{ data: SettingsData }>(apiUrl("/settings"), fetcher);
    // values keyed as "compositeKey::subKey" e.g. "score.weights::externalTrendScore"
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (data?.data) {
            const map: Record<string, string> = {};
            for (const [key, obj] of Object.entries(data.data)) {
                if (obj && typeof obj === "object") {
                    for (const [subKey, val] of Object.entries(obj)) {
                        map[`${key}::${subKey}`] = JSON.stringify(val);
                    }
                }
            }
            setValues(map);
        }
    }, [data]);

    async function handleSave() {
        setSaving(true);
        try {
            // Re-group flat values back into composite objects: { "score.weights": { externalTrendScore: 0.45, ... } }
            const patch: Record<string, Record<string, unknown>> = {};
            for (const [compoundKey, raw] of Object.entries(values)) {
                const sep = compoundKey.indexOf("::");
                if (sep === -1) continue;
                const key = compoundKey.slice(0, sep);
                const subKey = compoundKey.slice(sep + 2);
                if (!patch[key]) patch[key] = {};
                try {
                    patch[key][subKey] = JSON.parse(raw);
                } catch {
                    patch[key][subKey] = raw;
                }
            }

            await fetch(apiUrl("/settings"), {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(patch),
                credentials: "include",
            });

            await mutate();
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-white">Settings</h1>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 text-sm rounded-lg px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white transition-colors disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {saved ? "Saved!" : saving ? "Saving…" : "Save Changes"}
                </button>
            </div>

            {KNOWN_SETTINGS.map((section) => (
                <div key={section.section} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                        <h2 className="font-semibold text-gray-200 text-sm">{section.section}</h2>
                    </div>
                    <div className="divide-y divide-gray-800">
                        {section.keys.map(({ key, subKey, label, type }) => {
                            const compoundKey = `${key}::${subKey}`;
                            return (
                                <div key={compoundKey} className="flex items-center justify-between px-4 py-3 gap-4">
                                    <label htmlFor={compoundKey} className="text-sm text-gray-300 flex-1">{label}</label>
                                    {type === "boolean" ? (
                                        <input
                                            id={compoundKey}
                                            type="checkbox"
                                            checked={values[compoundKey] === "true"}
                                            onChange={(e) =>
                                                setValues((v) => ({ ...v, [compoundKey]: String(e.target.checked) }))
                                            }
                                            className="w-4 h-4 accent-brand-500"
                                        />
                                    ) : (
                                        <input
                                            id={compoundKey}
                                            type={type === "number" ? "number" : "text"}
                                            value={values[compoundKey] ?? ""}
                                            onChange={(e) => setValues((v) => ({ ...v, [compoundKey]: e.target.value }))}
                                            className="w-40 rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                                            step={type === "number" ? "0.01" : undefined}
                                        />
                                    )}
                                </div>
                            ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
