export function normalizeRequestHostname(value?: string | null) {
    const normalized = value?.split(",")[0]?.trim().toLowerCase() ?? "";
    if (!normalized) {
        return null as string | null;
    }

    if (normalized.startsWith("[")) {
        const closingIndex = normalized.indexOf("]");
        return closingIndex >= 0 ? normalized.slice(0, closingIndex + 1) : normalized;
    }

    return normalized.replace(/:\d+$/, "") || null;
}

export function resolveRequestHostname({
    forwardedHost,
    hostHeader,
    urlHostname,
}: {
    forwardedHost?: string | null;
    hostHeader?: string | null;
    urlHostname?: string | null;
}) {
    return normalizeRequestHostname(forwardedHost) ?? normalizeRequestHostname(hostHeader) ?? normalizeRequestHostname(urlHostname);
}

export function isLocalhostHostname(value?: string | null) {
    return normalizeRequestHostname(value) === "localhost";
}

export function canUseLocalhostMvpBypass({
    bypassActive,
    forwardedHost,
    hostHeader,
    urlHostname,
}: {
    bypassActive: boolean;
    forwardedHost?: string | null;
    hostHeader?: string | null;
    urlHostname?: string | null;
}) {
    return bypassActive && isLocalhostHostname(resolveRequestHostname({ forwardedHost, hostHeader, urlHostname }));
}
