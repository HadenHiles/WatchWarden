import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.API_URL ?? "http://localhost:4000";
const API_SECRET = process.env.API_SECRET ?? "";

export async function POST(request: NextRequest) {
    const body = await request.json();

    const res = await fetch(`${API_BASE}/auth/setup`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify(body),
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
}
