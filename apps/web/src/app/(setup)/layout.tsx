import { requireAuth } from "@/lib/auth";

export default async function SetupLayout({ children }: { children: React.ReactNode }) {
    await requireAuth();
    return <>{children}</>;
}
