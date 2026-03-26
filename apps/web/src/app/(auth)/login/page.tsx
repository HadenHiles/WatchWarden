"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const router = useRouter();
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
            });

            if (!res.ok) {
                const body = await res.json();
                setError(body.message ?? "Invalid password");
                return;
            }

            router.push("/dashboard/suggestions/movies");
            router.refresh();
        } catch {
            setError("Network error — please try again");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950 relative overflow-hidden">
            {/* Subtle radial glow */}
            <div className="absolute inset-0 bg-gradient-radial from-brand-500/5 via-transparent to-transparent pointer-events-none" />

            <div className="relative w-full max-w-sm space-y-8 px-8 py-10 bg-gray-900/70 rounded-2xl border border-gray-800/80 shadow-2xl backdrop-blur-sm">
                {/* Logo + wordmark */}
                <div className="flex flex-col items-center gap-4">
                    <Image
                        src="/images/watch-warden.png"
                        alt="Watch Warden"
                        width={72}
                        height={72}
                        className="object-contain"
                        priority
                    />
                    <div className="text-center">
                        <h1 className="text-xl font-semibold text-white tracking-tight">Watch Warden</h1>
                        <p className="text-xs text-gray-500 mt-0.5">Home media orchestration</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="password" className="block text-xs font-medium text-gray-400 uppercase tracking-wider">
                            Admin Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoFocus
                            className="w-full rounded-lg bg-gray-800/80 border border-gray-700/60 px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500/60 focus:border-brand-500/40 transition-all"
                            placeholder="Enter password"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 rounded-lg bg-red-950/40 border border-red-900/60 px-3 py-2.5">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:opacity-50 text-gray-950 font-semibold text-sm py-2.5 transition-all shadow-lg shadow-brand-500/20"
                    >
                        {loading ? "Signing in…" : "Sign in"}
                    </button>
                </form>
            </div>
        </div>
    );
}

}
