// No auth required — onboarding runs before any admin account exists.
export default function SetupLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
