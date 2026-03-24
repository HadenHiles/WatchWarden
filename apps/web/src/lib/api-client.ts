/**
 * API client for server-side calls (Server Components, Server Actions).
 * Uses API_URL (internal) with API_SECRET bearer auth.
 */

const API_BASE = process.env.API_URL ?? "http://localhost:4000";
const API_SECRET = process.env.API_SECRET ?? "";

type FetchOptions = {
    method?: string;
    body?: unknown;
    cache?: RequestCache;
    next?: NextFetchRequestConfig;
};

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const { method = "GET", body, cache, next } = options;

    const res = await fetch(`${API_BASE}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_SECRET}`,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache,
        next,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
}

/**
 * Client-side API URL — routes through the Next.js proxy so the browser
 * never needs the API_SECRET or direct access to the Express server.
 */
export function apiUrl(path: string): string {
    return `/api/proxy${path}`;
}
