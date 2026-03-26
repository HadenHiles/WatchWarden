"use client";

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
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
            <div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-xl p-8 space-y-6">
                <div className="space-y-1 text-center">
                    <h1 className="text-2xl font-bold text-white">Set a New Password</h1>
                    <p className="text-sm text-gray-400">
                        The default password must be changed before you can continue.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-300" htmlFor="password">
                            New password
                        </label>
                        <input
                            id="password"
                            type="password"
                            required
                            autoFocus
                            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Minimum 8 characters"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-gray-300" htmlFor="confirm">
                            Confirm password
                        </label>
                        <input
                            id="confirm"
                            type="password"
                            required
                            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            placeholder="Repeat your password"
                        />
                    </div>

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
                    >
                        {loading ? "Saving…" : "Set Password & Continue"}
                    </button>
                </form>
            </div>
        </div>
    );
}
