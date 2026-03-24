import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const API_BASE = process.env.API_URL ?? "http://localhost:4000";

export async function POST(request: NextRequest) {
    const body = await request.json();

    // Inject the admin username server-side — the UI only collects the password
    const loginBody = {
        username: process.env.ADMIN_USERNAME ?? "admin",
        password: body.password,
    };

    // Forward login to the backend API
    const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginBody),
    });

    if (!res.ok) {
        const error = await res.json();
        return NextResponse.json(error, { status: res.status });
    }

    // Set iron-session
    const session = await getSession();
    session.authenticated = true;
    await session.save();

    return NextResponse.json({ ok: true });
}
