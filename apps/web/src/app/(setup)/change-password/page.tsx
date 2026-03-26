"use client";

import Image from "next/image";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);

        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Failed to change password.");
                return;
            }

            // After password is changed, check setup status then go to the right page
            const statusRes = await fetch("/api/setup/status");
            const statusData = await statusRes.json();

            if (statusData.data?.complete) {
                router.push("/dashboard/suggestions/movies");
            } else {
                router.push("/onboarding");
            }
        } catch {
            setError("Unexpected error. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-radial from-brand-500/5 via-transparent to-transparent pointer-events-none" />

            <div className="relative w-full max-w-md bg-gray-900/70 rounded-2xl shadow-2xl border border-gray-800/80 p-8 space-y-7 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-4">
                    <Image
                        src="/images/watch-warden.png"
                        alt="Watch Warden"
                        width={60}
                        height={60}
                        className="object-contain"
                        priority
                    />
                    <div className="text-center">
                        <h1 className="text-lg font-semibold text-white">Set a New Password</h1>
                        <p className="text-xs text-gray-500 mt-1">
                            The default password must be changed before you can continue.
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider" htmlFor="password">
                            New password
                        </label>
                        <input
                            id="password"
                            type="password"
                            required
                            autoFocus
                            className="w-full rounded-lg bg-gray-800/80 border border-gray-700/60 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500/60 focus:border-brand-500/40 transition-all"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Minimum 8 characters"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider" htmlFor="confirm">
                            Confirm password
                        </label>
                        <input
                            id="confirm"
                            type="password"
                            required
                            className="w-full rounded-lg bg-gray-800/80 border border-gray-700/60 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500/60 focus:border-brand-500/40 transition-all"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            placeholder="Repeat your password"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 rounded-lg bg-red-950/40 border border-red-900/60 px-3 py-2.5">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-gray-950 transition-all shadow-lg shadow-brand-500/20"
                    >
                        {loading ? "Saving…" : "Set Password & Continue"}
                    </button>
                </form>
            </div>
        </div>
    );
}
