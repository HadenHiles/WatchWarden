import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const API_BASE = process.env.API_URL ?? "http://localhost:4000";
const API_SECRET = process.env.API_SECRET ?? "";

export async function POST(request: NextRequest) {
    const session = await getSession();
    if (!session.authenticated) {
        return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();

    const res = await fetch(`${API_BASE}/auth/change-password`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({ password: body.password }),
        cache: "no-store",
    });

    const data = await res.json();
    if (!res.ok) {
        return NextResponse.json(data, { status: res.status });
    }

    // Clear the forced-change flag from the browser session
    session.needsPasswordChange = false;
    await session.save();

    return NextResponse.json(data);
}
