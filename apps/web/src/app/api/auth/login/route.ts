import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const API_BASE = process.env.API_URL ?? "http://localhost:4000";
const API_SECRET = process.env.API_SECRET ?? "";

/** Gets the admin username — from DB (set during onboarding) or env fallback. */
async function getAdminUsername(): Promise<string> {
    try {
        const res = await fetch(`${API_BASE}/auth/admin-username`, { cache: "no-store" });
        const json = await res.json();
        if (json.data?.username) return json.data.username;
    } catch {
        // fall through to env
    }
    return process.env.ADMIN_USERNAME ?? "admin";
}

export async function POST(request: NextRequest) {
    const body = await request.json();

    const username = await getAdminUsername();
    const loginBody = { username, password: body.password };

    const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_SECRET}` },
        body: JSON.stringify(loginBody),
    });

    if (!res.ok) {
        const error = await res.json();
        return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    const session = await getSession();
    session.authenticated = true;
    session.needsPasswordChange = data.data?.needsPasswordChange === true;
    await session.save();

    return NextResponse.json({ ok: true, needsPasswordChange: session.needsPasswordChange });
}
