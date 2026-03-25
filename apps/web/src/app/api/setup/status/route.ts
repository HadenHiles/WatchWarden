import { NextResponse } from "next/server";

const API_BASE = process.env.API_URL ?? "http://localhost:4000";

export async function GET() {
    try {
        const res = await fetch(`${API_BASE}/auth/setup-status`, { cache: "no-store" });
        const json = await res.json();
        return NextResponse.json(json, { status: res.status });
    } catch {
        // If the API is unreachable, don't block the UI — treat as not complete
        return NextResponse.json({ success: false, data: { complete: false } });
    }
}
