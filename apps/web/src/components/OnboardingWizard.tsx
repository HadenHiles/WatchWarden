"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, ChevronRight, ChevronLeft, Loader2, Wifi, WifiOff, Eye, EyeOff } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminForm {
    username: string;
    password: string;
    confirm: string;
}

interface TautulliForm {
    baseUrl: string;
    apiKey: string;
}

interface JellyseerrForm {
    baseUrl: string;
    apiKey: string;
    botUserId: string;
}

interface SourcesForm {
    tmdbApiKey: string;
    traktClientId: string;
}

interface SchedulesForm {
    trendSyncCron: string;
    tautulliSyncCron: string;
    scoringCron: string;
    jellyseerrStatusSyncCron: string;
    librarySyncCron: string;
    lifecycleEvalCron: string;
    exportCron: string;
}

type TestState = null | "testing" | "ok" | "fail";

interface TestStatus {
    state: TestState;
    message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STEPS = ["welcome", "admin", "tautulli", "jellyseerr", "sources", "schedules", "done"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABELS: Record<Step, string> = {
    welcome: "Welcome",
    admin: "Admin Account",
    tautulli: "Tautulli",
    jellyseerr: "Jellyseerr",
    sources: "Trend Sources",
    schedules: "Schedules",
    done: "Done",
};

const DEFAULT_SCHEDULES: SchedulesForm = {
    trendSyncCron: "0 */6 * * *",
    tautulliSyncCron: "0 */2 * * *",
    scoringCron: "30 */6 * * *",
    jellyseerrStatusSyncCron: "0 * * * *",
    librarySyncCron: "0 */3 * * *",
    lifecycleEvalCron: "0 4 * * *",
    exportCron: "15 */6 * * *",
};

const CRON_LABELS: [keyof SchedulesForm, string][] = [
    ["trendSyncCron", "Trend Sync"],
    ["tautulliSyncCron", "Tautulli Sync"],
    ["scoringCron", "Scoring"],
    ["jellyseerrStatusSyncCron", "Jellyseerr Status Sync"],
    ["librarySyncCron", "Library Sync"],
    ["lifecycleEvalCron", "Lifecycle Evaluation"],
    ["exportCron", "Export"],
];

const INPUT_CLS =
    "w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-500";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function testConnection(
    type: string,
    baseUrl: string,
    apiKey: string,
): Promise<{ success: boolean; message?: string }> {
    const res = await fetch("/api/setup/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, baseUrl, apiKey }),
    });
    return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-300">{label}</label>
            {children}
            {hint && <p className="text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

function TestButton({
    state,
    message,
    disabled,
    onTest,
}: {
    state: TestState;
    message: string;
    disabled: boolean;
    onTest: () => void;
}) {
    return (
        <div className="flex items-center gap-3">
            <button
                type="button"
                onClick={onTest}
                disabled={disabled || state === "testing"}
                className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors disabled:opacity-40"
            >
                {state === "testing" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                ) : state === "ok" ? (
                    <Wifi className="w-4 h-4 text-green-400" />
                ) : state === "fail" ? (
                    <WifiOff className="w-4 h-4 text-red-400" />
                ) : (
                    <Wifi className="w-4 h-4" />
                )}
                Test Connection
            </button>
            {message && (
                <span
                    className={`text-xs ${state === "ok" ? "text-green-400" : state === "fail" ? "text-red-400" : "text-gray-400"
                        }`}
                >
                    {message}
                </span>
            )}
        </div>
    );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export function OnboardingWizard() {
    const router = useRouter();
    const [stepIdx, setStepIdx] = useState(0);
    const currentStep = STEPS[stepIdx];

    const [admin, setAdmin] = useState<AdminForm>({ username: "admin", password: "", confirm: "" });
    const [adminErrors, setAdminErrors] = useState<{ password?: string; confirm?: string }>({});
    const [showPassword, setShowPassword] = useState(false);

    const [tautulli, setTautulli] = useState<TautulliForm>({ baseUrl: "", apiKey: "" });
    const [tautulliTest, setTautulliTest] = useState<TestStatus>({ state: null, message: "" });

    const [jellyseerr, setJellyseerr] = useState<JellyseerrForm>({ baseUrl: "", apiKey: "", botUserId: "2" });
    const [jellyseerrTest, setJellyseerrTest] = useState<TestStatus>({ state: null, message: "" });

    const [sources, setSources] = useState<SourcesForm>({ tmdbApiKey: "", traktClientId: "" });
    const [schedules, setSchedules] = useState<SchedulesForm>(DEFAULT_SCHEDULES);

    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    function validateAdmin(): boolean {
        const errs: typeof adminErrors = {};
        if (admin.password.length < 8) errs.password = "Password must be at least 8 characters";
        if (admin.password !== admin.confirm) errs.confirm = "Passwords do not match";
        setAdminErrors(errs);
        return Object.keys(errs).length === 0;
    }

    async function handleNext() {
        if (currentStep === "admin" && !validateAdmin()) return;

        if (currentStep === "schedules") {
            // Final step — submit everything at once
            setSaving(true);
            setSubmitError(null);
            try {
                const payload = {
                    admin: { username: admin.username, password: admin.password },
                    ...(tautulli.baseUrl || tautulli.apiKey ? { tautulli } : {}),
                    ...(jellyseerr.baseUrl || jellyseerr.apiKey
                        ? {
                              jellyseerr: {
                                  ...jellyseerr,
                                  botUserId: parseInt(jellyseerr.botUserId, 10) || 2,
                              },
                          }
                        : {}),
                    ...(sources.tmdbApiKey || sources.traktClientId ? { sources } : {}),
                    refreshIntervals: schedules,
                };

                const res = await fetch("/api/setup/submit", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const json = await res.json();
                if (!res.ok) {
                    setSubmitError(json.error ?? "Setup failed — please try again");
                    return;
                }

                setStepIdx((i) => i + 1); // go to done
            } finally {
                setSaving(false);
            }
            return;
        }

        if (currentStep === "done") {
            router.push("/login");
            return;
        }

        setStepIdx((i) => i + 1);
    }

    async function handleTestTautulli() {
        setTautulliTest({ state: "testing", message: "" });
        const result = await testConnection("tautulli", tautulli.baseUrl, tautulli.apiKey);
        setTautulliTest({ state: result.success ? "ok" : "fail", message: result.message ?? "" });
    }

    async function handleTestJellyseerr() {
        setJellyseerrTest({ state: "testing", message: "" });
        const result = await testConnection("jellyseerr", jellyseerr.baseUrl, jellyseerr.apiKey);
        setJellyseerrTest({ state: result.success ? "ok" : "fail", message: result.message ?? "" });
    }

    const configSteps = (["admin", "tautulli", "jellyseerr", "sources", "schedules"] as const).map(
        (s) => STEP_LABELS[s],
    );
    const currentConfigIdx = configSteps.indexOf(STEP_LABELS[currentStep]);

    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-950">
            <div className="w-full max-w-lg">
                {/* Progress bar (hidden on welcome & done) */}
                {currentStep !== "welcome" && currentStep !== "done" && (
                    <div className="mb-6">
                        <div className="flex justify-between text-xs text-gray-500 mb-2">
                            {configSteps.map((label, i) => (
                                <span
                                    key={label}
                                    className={i <= currentConfigIdx ? "text-brand-400" : "text-gray-600"}
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-1">
                            {configSteps.map((label, i) => (
                                <div
                                    key={label}
                                    className={`h-1 flex-1 rounded-full transition-colors ${i < currentConfigIdx
                                            ? "bg-brand-500"
                                            : i === currentConfigIdx
                                                ? "bg-brand-400"
                                                : "bg-gray-700"
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 shadow-xl">
                    {/* ── Welcome ─────────────────────────────────────────── */}
                    {currentStep === "welcome" && (
                        <>
                            <h1 className="text-2xl font-bold text-white mb-2">Welcome to Watch Warden</h1>
                            <p className="text-gray-400 mb-6 text-sm leading-relaxed">
                                Let&#39;s get everything set up. You&#39;ll create your admin account and configure
                                your integrations. Every step after admin is optional — skip anything and update it
                                later from Settings.
                            </p>
                            <ul className="space-y-2.5 mb-6">
                                {[
                                    { label: "Admin Account", desc: "Username and password for the dashboard" },
                                    { label: "Tautulli", desc: "Local watch history & engagement signals" },
                                    { label: "Jellyseerr", desc: "Automated media requests" },
                                    { label: "Trend Sources", desc: "TMDB & Trakt API keys for trending data" },
                                    { label: "Schedules", desc: "Job cron schedules (pre-filled with defaults)" },
                                ].map(({ label, desc }) => (
                                    <li key={label} className="flex items-start gap-3 text-sm text-gray-300">
                                        <ChevronRight className="w-4 h-4 mt-0.5 text-brand-400 flex-shrink-0" />
                                        <span>
                                            <span className="font-medium text-white">{label}</span> — {desc}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-3 text-xs text-yellow-300 mb-6 leading-relaxed">
                                <strong>Accessing from a remote IP?</strong> If you&#39;re connecting over Tailscale
                                or your LAN (e.g.{" "}
                                <code className="text-yellow-200 bg-yellow-900/40 px-1 rounded">192.168.x.x</code>),
                                make sure{" "}
                                <code className="text-yellow-200 bg-yellow-900/40 px-1 rounded">NEXTAUTH_URL</code>{" "}
                                in your{" "}
                                <code className="text-yellow-200 bg-yellow-900/40 px-1 rounded">.env</code> matches
                                that address.
                            </div>
                            <button
                                onClick={() => setStepIdx(1)}
                                className="w-full flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-3 font-semibold transition-colors text-sm"
                            >
                                Get Started
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </>
                    )}

                    {/* ── Admin Account ────────────────────────────────────── */}
                    {currentStep === "admin" && (
                        <>
                            <h2 className="text-xl font-bold text-white mb-1">Admin Account</h2>
                            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
                                Create the administrator account you&#39;ll use to log in to the dashboard.
                            </p>
                            <div className="space-y-4">
                                <Field label="Username">
                                    <input
                                        type="text"
                                        value={admin.username}
                                        onChange={(e) => setAdmin((f) => ({ ...f, username: e.target.value }))}
                                        placeholder="admin"
                                        autoComplete="username"
                                        className={INPUT_CLS}
                                    />
                                </Field>
                                <Field label="Password">
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={admin.password}
                                            onChange={(e) => {
                                                setAdmin((f) => ({ ...f, password: e.target.value }));
                                                setAdminErrors((e2) => ({ ...e2, password: undefined }));
                                            }}
                                            placeholder="At least 8 characters"
                                            autoComplete="new-password"
                                            className={INPUT_CLS + " pr-10"}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword((v) => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {adminErrors.password && (
                                        <p className="text-xs text-red-400 mt-1">{adminErrors.password}</p>
                                    )}
                                </Field>
                                <Field label="Confirm Password">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        value={admin.confirm}
                                        onChange={(e) => {
                                            setAdmin((f) => ({ ...f, confirm: e.target.value }));
                                            setAdminErrors((e2) => ({ ...e2, confirm: undefined }));
                                        }}
                                        placeholder="Repeat password"
                                        autoComplete="new-password"
                                        className={INPUT_CLS}
                                    />
                                    {adminErrors.confirm && (
                                        <p className="text-xs text-red-400 mt-1">{adminErrors.confirm}</p>
                                    )}
                                </Field>
                            </div>
                        </>
                    )}

                    {/* ── Tautulli ─────────────────────────────────────────── */}
                    {currentStep === "tautulli" && (
                        <>
                            <h2 className="text-xl font-bold text-white mb-1">Tautulli</h2>
                            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
                                Provides local watch history and engagement signals for scoring. Skip if you
                                don&#39;t use Tautulli.
                            </p>
                            <div className="space-y-4">
                                <Field label="Base URL" hint="e.g. http://192.168.8.3:8181">
                                    <input
                                        type="url"
                                        value={tautulli.baseUrl}
                                        onChange={(e) => {
                                            setTautulli((f) => ({ ...f, baseUrl: e.target.value }));
                                            setTautulliTest({ state: null, message: "" });
                                        }}
                                        placeholder="http://192.168.8.3:8181"
                                        className={INPUT_CLS}
                                    />
                                </Field>
                                <Field label="API Key">
                                    <input
                                        type="password"
                                        value={tautulli.apiKey}
                                        onChange={(e) => {
                                            setTautulli((f) => ({ ...f, apiKey: e.target.value }));
                                            setTautulliTest({ state: null, message: "" });
                                        }}
                                        placeholder="your_tautulli_api_key"
                                        className={INPUT_CLS}
                                    />
                                </Field>
                                <TestButton
                                    state={tautulliTest.state}
                                    message={tautulliTest.message}
                                    disabled={!tautulli.baseUrl || !tautulli.apiKey}
                                    onTest={handleTestTautulli}
                                />
                            </div>
                        </>
                    )}

                    {/* ── Jellyseerr ───────────────────────────────────────── */}
                    {currentStep === "jellyseerr" && (
                        <>
                            <h2 className="text-xl font-bold text-white mb-1">Jellyseerr</h2>
                            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
                                Used to submit approved media requests and sync their status. Skip if you
                                don&#39;t use Jellyseerr.
                            </p>
                            <div className="space-y-4">
                                <Field label="Base URL" hint="e.g. http://192.168.8.3:5055">
                                    <input
                                        type="url"
                                        value={jellyseerr.baseUrl}
                                        onChange={(e) => {
                                            setJellyseerr((f) => ({ ...f, baseUrl: e.target.value }));
                                            setJellyseerrTest({ state: null, message: "" });
                                        }}
                                        placeholder="http://192.168.8.3:5055"
                                        className={INPUT_CLS}
                                    />
                                </Field>
                                <Field label="API Key">
                                    <input
                                        type="password"
                                        value={jellyseerr.apiKey}
                                        onChange={(e) => {
                                            setJellyseerr((f) => ({ ...f, apiKey: e.target.value }));
                                            setJellyseerrTest({ state: null, message: "" });
                                        }}
                                        placeholder="your_jellyseerr_api_key"
                                        className={INPUT_CLS}
                                    />
                                </Field>
                                <Field
                                    label="Bot User ID"
                                    hint="Numeric ID of the Jellyseerr automation account (Settings → Users)"
                                >
                                    <input
                                        type="number"
                                        value={jellyseerr.botUserId}
                                        onChange={(e) =>
                                            setJellyseerr((f) => ({ ...f, botUserId: e.target.value }))
                                        }
                                        min={1}
                                        className={INPUT_CLS}
                                    />
                                </Field>
                                <TestButton
                                    state={jellyseerrTest.state}
                                    message={jellyseerrTest.message}
                                    disabled={!jellyseerr.baseUrl || !jellyseerr.apiKey}
                                    onTest={handleTestJellyseerr}
                                />
                            </div>
                        </>
                    )}

                    {/* ── Trend Sources ─────────────────────────────────────── */}
                    {currentStep === "sources" && (
                        <>
                            <h2 className="text-xl font-bold text-white mb-1">Trend Sources</h2>
                            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
                                API credentials for external trending data. Both are free and optional.
                            </p>
                            <div className="space-y-4">
                                <Field label="TMDB API Key" hint="Free at themoviedb.org → Settings → API">
                                    <input
                                        type="password"
                                        value={sources.tmdbApiKey}
                                        onChange={(e) =>
                                            setSources((f) => ({ ...f, tmdbApiKey: e.target.value }))
                                        }
                                        placeholder="your_tmdb_api_key"
                                        className={INPUT_CLS}
                                    />
                                </Field>
                                <Field
                                    label="Trakt Client ID"
                                    hint="Free at trakt.tv → Settings → Your API Apps"
                                >
                                    <input
                                        type="password"
                                        value={sources.traktClientId}
                                        onChange={(e) =>
                                            setSources((f) => ({ ...f, traktClientId: e.target.value }))
                                        }
                                        placeholder="your_trakt_client_id"
                                        className={INPUT_CLS}
                                    />
                                </Field>
                            </div>
                        </>
                    )}

                    {/* ── Schedules ─────────────────────────────────────────── */}
                    {currentStep === "schedules" && (
                        <>
                            <h2 className="text-xl font-bold text-white mb-1">Scheduler</h2>
                            <p className="text-gray-400 text-sm mb-1 leading-relaxed">
                                Cron expressions for background jobs. Defaults are pre-filled.
                            </p>
                            <p className="text-yellow-400/80 text-xs mb-5">
                                Changes to schedules require restarting the worker to take effect.
                            </p>
                            <div className="space-y-3">
                                {CRON_LABELS.map(([key, label]) => (
                                    <div key={key} className="flex items-center gap-3">
                                        <label className="text-sm text-gray-300 w-44 flex-shrink-0">{label}</label>
                                        <input
                                            type="text"
                                            value={schedules[key]}
                                            onChange={(e) =>
                                                setSchedules((s) => ({ ...s, [key]: e.target.value }))
                                            }
                                            className={INPUT_CLS + " font-mono text-xs"}
                                        />
                                    </div>
                                ))}
                            </div>
                            {submitError && (
                                <p className="mt-4 text-sm text-red-400 rounded-lg bg-red-900/20 border border-red-800 px-3 py-2">
                                    {submitError}
                                </p>
                            )}
                        </>
                    )}

                    {/* ── Done ──────────────────────────────────────────────── */}
                    {currentStep === "done" && (
                        <>
                            <div className="flex justify-center mb-5">
                                <CheckCircle className="w-16 h-16 text-green-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white text-center mb-2">
                                You&#39;re all set!
                            </h2>
                            <p className="text-gray-400 text-sm text-center mb-2 leading-relaxed">
                                Your account and integrations are configured. Sign in with the credentials you just
                                created.
                            </p>
                            <p className="text-gray-500 text-xs text-center mb-8">
                                Username:{" "}
                                <span className="text-gray-300 font-mono">{admin.username}</span>
                            </p>
                        </>
                    )}

                    {/* ── Navigation ─────────────────────────────────────────── */}
                    {currentStep !== "welcome" && (
                        <div className="flex gap-3 mt-8">
                            {currentStep !== "done" && (
                                <button
                                    onClick={() => setStepIdx((i) => i - 1)}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white px-3 py-2 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors disabled:opacity-50"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                </button>
                            )}
                            <button
                                onClick={handleNext}
                                disabled={saving || (currentStep === "admin" && !admin.username)}
                                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 font-semibold transition-colors disabled:opacity-50 text-sm"
                            >
                                {saving ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : currentStep === "done" ? (
                                    "Go to Login"
                                ) : currentStep === "schedules" ? (
                                    <>
                                        Finish Setup
                                        <ChevronRight className="w-4 h-4" />
                                    </>
                                ) : (
                                    <>
                                        Next
                                        <ChevronRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


