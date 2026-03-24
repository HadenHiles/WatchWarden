"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Save } from "lucide-react";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

interface Setting {
    key: string;
    value: unknown;
    description?: string;
}

const KNOWN_SETTINGS = [
    {
        section: "Scoring Weights",
        keys: [
            { key: "score.weights.external", label: "External Trend Weight", type: "number" },
            { key: "score.weights.local", label: "Local Interest Weight", type: "number" },
            { key: "score.weights.freshness", label: "Freshness Weight", type: "number" },
            { key: "score.weights.editorial", label: "Editorial Boost Weight", type: "number" },
        ],
    },
    {
        section: "Exclusions",
        keys: [
            { key: "exclusions.excludeInLibrary", label: "Exclude titles in library", type: "boolean" },
            { key: "exclusions.excludeRequested", label: "Exclude already requested", type: "boolean" },
            { key: "exclusions.excludePermanentlyRejected", label: "Exclude permanently rejected", type: "boolean" },
        ],
    },
    {
        section: "Retention",
        keys: [
            { key: "retention.cleanupEligibleAfterDays", label: "Days until cleanup eligible", type: "number" },
            { key: "retention.expireAfterDays", label: "Days from cleanup until expired", type: "number" },
        ],
    },
    {
        section: "Integrations",
        keys: [
            { key: "jellyseerr.rootFolder", label: "Jellyseerr Root Folder", type: "string" },
            { key: "jellyseerr.qualityProfileId", label: "Quality Profile ID", type: "number" },
        ],
    },
];

export default function SettingsPage() {
    const { data, mutate } = useSWR<{ data: Setting[] }>(apiUrl("/settings"), fetcher);
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (data?.data) {
            const map: Record<string, string> = {};
            for (const s of data.data) {
                map[s.key] = JSON.stringify(s.value);
            }
            setValues(map);
        }
    }, [data]);

    async function handleSave() {
        setSaving(true);
        try {
            const patch: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(values)) {
                try {
                    patch[k] = JSON.parse(v);
                } catch {
                    patch[k] = v;
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
                        {section.keys.map(({ key, label, type }) => (
                            <div key={key} className="flex items-center justify-between px-4 py-3 gap-4">
                                <label htmlFor={key} className="text-sm text-gray-300 flex-1">{label}</label>
                                {type === "boolean" ? (
                                    <input
                                        id={key}
                                        type="checkbox"
                                        checked={values[key] === "true"}
                                        onChange={(e) =>
                                            setValues((v) => ({ ...v, [key]: String(e.target.checked) }))
                                        }
                                        className="w-4 h-4 accent-brand-500"
                                    />
                                ) : (
                                    <input
                                        id={key}
                                        type={type === "number" ? "number" : "text"}
                                        value={values[key] ?? ""}
                                        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
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
