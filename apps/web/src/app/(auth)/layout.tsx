import { redirect } from "next/navigation";

async function isSetupComplete(): Promise<boolean> {
    try {
        const res = await fetch(
            `${process.env.API_URL ?? "http://localhost:4000"}/auth/setup-status`,
            { cache: "no-store" },
        );
        if (!res.ok) return true;
        const json = await res.json();
        return json.data?.complete === true;
    } catch {
        // Keep login reachable if the API is temporarily unavailable.
        return true;
    }
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
    if (!(await isSetupComplete())) redirect("/onboarding");
    return <>{children}</>;
}
