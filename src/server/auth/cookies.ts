import type { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";

export const AUTH_ACCESS_COOKIE = "gauset-access-token";
export const AUTH_REFRESH_COOKIE = "gauset-refresh-token";
export const AUTH_SESSION_AT_COOKIE = "gauset-session-at";
export const PLATFORM_SESSION_COOKIE = "gauset-platform-session";

function createCookieOptions() {
    const secure = process.env.NODE_ENV === "production";
    return {
        httpOnly: true,
        secure,
        sameSite: "lax" as const,
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
    };
}

export function setAuthCookies(
    cookieStore: ResponseCookies,
    payload: { accessToken: string; refreshToken?: string | null; authenticatedAt?: string | null },
) {
    const options = createCookieOptions();
    cookieStore.set(AUTH_ACCESS_COOKIE, payload.accessToken, options);
    if (payload.refreshToken) {
        cookieStore.set(AUTH_REFRESH_COOKIE, payload.refreshToken, options);
    }
    cookieStore.set(AUTH_SESSION_AT_COOKIE, payload.authenticatedAt ?? new Date().toISOString(), options);
}

export function setPlatformSessionCookie(cookieStore: ResponseCookies, sessionId: string) {
    cookieStore.set(PLATFORM_SESSION_COOKIE, sessionId, createCookieOptions());
}

export function clearAuthCookies(cookieStore: ResponseCookies) {
    [AUTH_ACCESS_COOKIE, AUTH_REFRESH_COOKIE, AUTH_SESSION_AT_COOKIE, PLATFORM_SESSION_COOKIE].forEach((name) => {
        cookieStore.set(name, "", {
            path: "/",
            expires: new Date(0),
        });
    });
}
