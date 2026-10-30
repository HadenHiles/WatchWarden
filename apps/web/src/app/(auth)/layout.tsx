import { redirect } from "next/navigation";
import { headers } from "next/headers";

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
    if (process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL) {
        const canonical = new URL(process.env.NEXTAUTH_URL);
        const requestHeaders = headers();
        const host = requestHeaders.get("host");
        const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0].trim();
        if (canonical.protocol === "https:" && host && host !== canonical.host && protocol !== "https") {
            redirect(new URL("/login", canonical).toString());
        }
    }
    if (!(await isSetupComplete())) redirect("/onboarding");
    return <>{children}</>;
}
