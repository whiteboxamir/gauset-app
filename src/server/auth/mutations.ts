import type { NextRequest } from "next/server";

export function isSameOriginMutation(request: Pick<NextRequest, "headers" | "nextUrl">) {
    const origin = request.headers.get("origin");
    const fetchSite = request.headers.get("sec-fetch-site");

    if (origin) {
        return origin === request.nextUrl.origin;
    }

    if (fetchSite) {
        return fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
    }

    return false;
}
