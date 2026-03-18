export function sanitizeNextPath(input?: string | null, fallback = "/app/dashboard") {
    const value = String(input || "").trim();
    if (!value) return fallback;
    if (!value.startsWith("/")) return fallback;
    if (value.startsWith("//")) return fallback;
    if (value.startsWith("/api/")) return fallback;
    return value;
}

export function buildAuthCallbackUrl({
    origin,
    nextPath,
    invitationToken,
}: {
    origin: string;
    nextPath?: string | null;
    invitationToken?: string | null;
}) {
    const url = new URL("/auth/callback", origin);
    url.searchParams.set("next", sanitizeNextPath(nextPath));

    const normalizedInvitationToken = String(invitationToken || "").trim();
    if (normalizedInvitationToken) {
        url.searchParams.set("invite_token", normalizedInvitationToken);
    }

    return url.toString();
}
