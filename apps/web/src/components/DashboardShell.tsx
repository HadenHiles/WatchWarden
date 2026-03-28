"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { UpdateBanner } from "./UpdateBanner";

export function DashboardShell({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <div className="flex flex-col flex-1 overflow-hidden min-w-0">
                <Header onToggleSidebar={() => setSidebarOpen((v) => !v)} />
                <UpdateBanner />
                <main className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
            </div>
        </div>
    );
}
