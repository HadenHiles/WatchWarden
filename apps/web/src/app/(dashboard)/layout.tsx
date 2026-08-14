import { requireAuth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/DashboardShell";

async function isSetupComplete(): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(
            `${process.env.API_URL ?? "http://localhost:4000"}/auth/setup-status`,
            {
                headers: { Authorization: `Bearer ${process.env.API_SECRET ?? ""}` },
                cache: "no-store",
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
    const setupDone = await isSetupComplete();
    if (!setupDone) redirect("/onboarding");

    const session = await requireAuth();
    if (session.needsPasswordChange) redirect("/change-password");

    return <DashboardShell>{children}</DashboardShell>;
}
