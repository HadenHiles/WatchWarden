import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

async function isSetupComplete(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
            `${process.env.API_URL ?? "http://localhost:4000"}/auth/setup-status`,
            {
                headers: { Authorization: `Bearer ${process.env.API_SECRET ?? ""}` },
                next: { revalidate: 300 }, // cache for 5 min — setup status is stable once complete
                signal: controller.signal,
            },
        );
        clearTimeout(timeout);
        if (!res.ok) return true;
        const json = await res.json();
        return json.data?.complete === true;
    } catch {
        return true; // don't block if API is unreachable or timed out
    }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    const session = await requireAuth();

    if (session.needsPasswordChange) redirect("/change-password");

    const setupDone = await isSetupComplete();
    if (!setupDone) redirect("/onboarding");

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">{children}</main>
            </div>
        </div>
    );
}
