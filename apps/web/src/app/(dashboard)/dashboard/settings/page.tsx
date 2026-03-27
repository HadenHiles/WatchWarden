"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Save, Settings2 } from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api-client";

const fetcher = (url: string) =>
    fetch(url, { credentials: "include" }).then((r) => r.json());

type FieldType = "number" | "boolean" | "text" | "password" | "url";

interface SettingField {
    key: string;
    subKey: string;
    label: string;
    type: FieldType;
    hint?: string;
    placeholder?: string;
}

interface SettingSection {
    section: string;
    note?: string;
    keys: SettingField[];
}

const KNOWN_SETTINGS: SettingSection[] = [
    {
        section: "Scoring Weights",
        note: "Values must be between 0.0 and 1.0 and should sum to 1.0 (e.g. 0.45 + 0.35 + 0.10 + 0.10). The worker will normalize them if they don't.",
        keys: [
            { key: "score.weights", subKey: "externalTrendScore", label: "External Trend Weight", type: "number", hint: "0.0 – 1.0", placeholder: "0.45" },
            { key: "score.weights", subKey: "localInterestScore", label: "Local Interest Weight", type: "number", hint: "0.0 – 1.0", placeholder: "0.35" },
            { key: "score.weights", subKey: "freshnessScore", label: "Freshness Weight", type: "number", hint: "0.0 – 1.0", placeholder: "0.10" },
            { key: "score.weights", subKey: "editorialBoost", label: "Editorial Boost Weight", type: "number", hint: "0.0 – 1.0", placeholder: "0.10" },
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
    {
        section: "Plex",
        keys: [
            { key: "plex", subKey: "baseUrl", label: "Server URL", type: "url", placeholder: "http://192.168.8.3:32400" },
            { key: "plex", subKey: "token", label: "Plex Token", type: "password", placeholder: "xxxxxxxxxxxxxxxxxxxx" },
        ],
    },
    {
        section: "Tautulli",
        keys: [
            { key: "tautulli", subKey: "baseUrl", label: "Base URL", type: "url", placeholder: "http://192.168.8.3:8181" },
            { key: "tautulli", subKey: "apiKey", label: "API Key", type: "password", placeholder: "your_tautulli_api_key" },
        ],
    },
    {
        section: "Jellyseerr",
        keys: [
            { key: "jellyseerr", subKey: "baseUrl", label: "Base URL", type: "url", placeholder: "http://192.168.8.3:5055" },
            { key: "jellyseerr", subKey: "apiKey", label: "API Key", type: "password", placeholder: "your_jellyseerr_api_key" },
            { key: "jellyseerr", subKey: "botUserId", label: "Bot User ID", type: "number", hint: "Numeric ID of the automation account" },
        ],
    },
    {
        section: "Trend Sources",
        keys: [
            { key: "sources", subKey: "tmdbApiKey", label: "TMDB API Key", type: "password", hint: "Free at themoviedb.org → Settings → API", placeholder: "your_tmdb_api_key" },
            { key: "sources", subKey: "traktClientId", label: "Trakt Client ID", type: "password", hint: "Free at trakt.tv → Settings → Your API Apps", placeholder: "your_trakt_client_id" },
        ],
    },
    {
        section: "Scheduler",
        note: "Changes to cron schedules require restarting the worker to take effect.",
        keys: [
            { key: "refreshIntervals", subKey: "trendSyncCron", label: "Trend Sync", type: "text", placeholder: "0 */6 * * *" },
            { key: "refreshIntervals", subKey: "tautulliSyncCron", label: "Tautulli Sync", type: "text", placeholder: "0 */2 * * *" },
            { key: "refreshIntervals", subKey: "scoringCron", label: "Scoring", type: "text", placeholder: "30 */6 * * *" },
            { key: "refreshIntervals", subKey: "jellyseerrStatusSyncCron", label: "Jellyseerr Status Sync", type: "text", placeholder: "0 * * * *" },
            { key: "refreshIntervals", subKey: "librarySyncCron", label: "Library Sync (Jellyseerr)", type: "text", placeholder: "0 */3 * * *" },
            { key: "refreshIntervals", subKey: "lifecycleEvalCron", label: "Lifecycle Evaluation", type: "text", placeholder: "0 4 * * *" },
            { key: "refreshIntervals", subKey: "exportCron", label: "Export", type: "text", placeholder: "15 */6 * * *" },
            { key: "refreshIntervals", subKey: "plexLibrarySyncCron", label: "Plex Library Scan", type: "text", placeholder: "0 */4 * * *" },
            { key: "refreshIntervals", subKey: "plexSyncCron", label: "Plex Collection Sync", type: "text", placeholder: "45 */6 * * *" },
        ],
    },
];

type SettingsData = Record<string, Record<string, unknown>>;

export default function SettingsPage() {
    const { data, mutate } = useSWR<{ data: SettingsData }>(apiUrl("/settings"), fetcher);
    const [values, setValues] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (data?.data) {
            const map: Record<string, string> = {};
            for (const [key, obj] of Object.entries(data.data)) {
                if (obj && typeof obj === "object") {
                    for (const [subKey, val] of Object.entries(obj)) {
                        map[`${key}::${subKey}`] = JSON.stringify(val).replace(/^"|"$/g, "");
                    }
                }
            }
            setValues(map);
        }
    }, [data]);

    async function handleSave() {
        setSaving(true);
        try {
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
                <div className="flex items-center gap-3">
                    <Link
                        href="/onboarding"
                        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors"
                    >
                        <Settings2 className="w-3.5 h-3.5" />
                        Re-run Setup Wizard
                    </Link>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 text-sm rounded-lg px-4 py-2 bg-brand-500 hover:bg-brand-600 text-gray-950 transition-colors disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saved ? "Saved!" : saving ? "Saving…" : "Save Changes"}
                    </button>
                </div>
            </div>

            {KNOWN_SETTINGS.map((section) => (
                <div key={section.section} className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                        <h2 className="font-semibold text-gray-200 text-sm">{section.section}</h2>
                        {section.note && (
                            <p className="text-xs text-yellow-400/80 mt-0.5">{section.note}</p>
                        )}
                    </div>
                    <div className="divide-y divide-gray-800">
                        {section.keys.map(({ key, subKey, label, type, hint, placeholder }) => {
                            const compoundKey = `${key}::${subKey}`;
                            return (
                                <div key={compoundKey} className="px-4 py-3 space-y-1">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <label htmlFor={compoundKey} className="text-sm text-gray-300">
                                                {label}
                                            </label>
                                            {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
                                        </div>
                                        {type === "boolean" ? (
                                            <input
                                                id={compoundKey}
                                                type="checkbox"
                                                checked={values[compoundKey] === "true"}
                                                onChange={(e) =>
                                                    setValues((v) => ({
                                                        ...v,
                                                        [compoundKey]: String(e.target.checked),
                                                    }))
                                                }
                                                className="w-4 h-4 accent-brand-500"
                                            />
                                        ) : (
                                            <input
                                                id={compoundKey}
                                                type={type === "number" ? "number" : type === "password" ? "password" : "text"}
                                                value={values[compoundKey] ?? ""}
                                                onChange={(e) =>
                                                    setValues((v) => ({ ...v, [compoundKey]: e.target.value }))
                                                }
                                                placeholder={placeholder}
                                                className={`rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 ${type === "number" ? "w-32" : "w-56"
                                                    } ${type === "text" && key === "refreshIntervals" ? "font-mono text-xs" : ""}`}
                                                step={type === "number" ? "0.01" : undefined}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
