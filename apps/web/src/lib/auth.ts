import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export interface SessionData {
    authenticated: boolean;
    needsPasswordChange?: boolean;
}

const sessionOptions = {
    password: process.env.SESSION_SECRET ?? "change-me-please-at-least-32-characters!!",
    cookieName: "ww_session",
    cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 60 * 60 * 8, // 8 hours
        sameSite: "lax" as const,
    },
};

export async function getSession() {
    return getIronSession<SessionData>(cookies(), sessionOptions);
}

export async function requireAuth() {
    const session = await getSession();
    if (!session.authenticated) {
        redirect("/login");
    }
    return session;
}
