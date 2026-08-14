import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RootPage() {
    let setupComplete = true;
    try {
        const res = await fetch(
            `${process.env.API_URL ?? "http://localhost:4000"}/auth/setup-status`,
            { cache: "no-store" },
        );
        if (res.ok) {
            const json = await res.json();
            setupComplete = json.data?.complete === true;
        }
    } catch {
        // Let the dashboard surface authentication while the API recovers.
    }

    if (!setupComplete) redirect("/onboarding");
    redirect("/dashboard");
}
