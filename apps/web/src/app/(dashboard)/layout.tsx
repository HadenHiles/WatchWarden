import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

async function isSetupComplete(): Promise<boolean> {
    try {
        const res = await fetch(
            `${process.env.API_URL ?? "http://localhost:4000"}/auth/setup-status`,
            {
                headers: { Authorization: `Bearer ${process.env.API_SECRET ?? ""}` },
                cache: "no-store",
            },
        );
        if (!res.ok) return true; // don't block the dashboard if the check fails
        const json = await res.json();
        return json.data?.complete === true;
    } catch {
        return true; // don't block if API is unreachable
    }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
    await requireAuth();

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
