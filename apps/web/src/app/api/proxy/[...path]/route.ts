/**
 * Catch-all proxy: forwards requests from client components to the Express API,
 * injecting the API_SECRET bearer token server-side so it is never exposed to
 * the browser.
 *
 * Client components call  fetch(apiUrl("/suggestions"))
 * → browser hits          /api/proxy/suggestions
 * → this handler proxies  GET http://express:4000/suggestions  (with Bearer auth)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const API_BASE = process.env.API_URL ?? "http://localhost:4000";
const API_SECRET = process.env.API_SECRET ?? "";

async function handler(
    req: NextRequest,
    { params }: { params: { path: string[] } }
): Promise<NextResponse> {
    const session = await getSession();
    if (!session.authenticated) {

        let body: string | undefined;
        if (req.method !== "GET" && req.method !== "HEAD") {
            body = await req.text();
        }

        const upstream = await fetch(upstreamUrl, {
            method: req.method,
            headers,
            body,
        });

        const data = await upstream.text();
        return new NextResponse(data, {
            status: upstream.status,
            headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
        });
    }

    export const GET = handler;
    export const POST = handler;
    export const PATCH = handler;
    export const PUT = handler;
    export const DELETE = handler;
