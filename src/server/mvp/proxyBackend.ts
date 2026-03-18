import { HOP_BY_HOP_HEADERS } from "./proxyShared.ts";

function normalizeBaseUrl(value: string) {
    return value.trim().replace(/\/$/, "");
}

export function resolveInternalBackendBaseUrlForOrigin({
    origin,
    env = process.env,
}: {
    origin: string;
    env?: NodeJS.ProcessEnv;
}) {
    const explicitInternal = env.GAUSET_INTERNAL_BACKEND_URL ?? "";
    if (explicitInternal.trim()) {
        return normalizeBaseUrl(explicitInternal);
    }

    const forceExternalBackend = env.GAUSET_FORCE_EXTERNAL_BACKEND === "1";
    if (forceExternalBackend) {
        return "";
    }

    const isVercelRuntime = env.VERCEL === "1";
    if (!isVercelRuntime) {
        return "";
    }

    return `${origin}/api/_mvp_backend`;
}

export function resolveBackendBaseUrlForOrigin({
    origin,
    env = process.env,
}: {
    origin: string;
    env?: NodeJS.ProcessEnv;
}) {
    const explicit =
        env.GAUSET_BACKEND_URL ??
        env.NEXT_PUBLIC_GAUSET_API_BASE_URL ??
        (env.NODE_ENV !== "production" ? "http://localhost:8000" : "");
    if (explicit.trim()) {
        return normalizeBaseUrl(explicit);
    }

    const internal = resolveInternalBackendBaseUrlForOrigin({ origin, env });
    if (internal) {
        return internal;
    }

    return "";
}

export function resolveBackendWorkerToken(env: NodeJS.ProcessEnv = process.env) {
    const explicit =
        env.GAUSET_BACKEND_WORKER_TOKEN ??
        env.GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN ??
        env.GAUSET_WORKER_TOKEN ??
        "";
    return explicit.trim();
}

export function buildUpstreamUrl({
    backendBaseUrl,
    pathname,
    searchParams,
}: {
    backendBaseUrl: string;
    pathname: string;
    searchParams: URLSearchParams;
}) {
    const upstreamUrl = new URL(`${backendBaseUrl}/${pathname}`);
    searchParams.forEach((value, key) => {
        if (key === "share") {
            return;
        }
        upstreamUrl.searchParams.set(key, value);
    });
    return upstreamUrl;
}

export function buildUpstreamRequestHeaders({
    requestHeaders,
    workerToken,
    studioId,
    userId,
}: {
    requestHeaders: Headers;
    workerToken?: string | null;
    studioId?: string | null;
    userId?: string | null;
}) {
    const headers = new Headers();
    requestHeaders.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            headers.set(key, value);
        }
    });
    headers.set("accept-encoding", "identity");
    if (workerToken) {
        headers.set("authorization", `Bearer ${workerToken}`);
        headers.set("x-gauset-worker-token", workerToken);
    }
    if (studioId?.trim()) {
        headers.set("x-gauset-studio-id", studioId.trim());
    }
    if (userId?.trim()) {
        headers.set("x-gauset-user-id", userId.trim());
    }
    return headers;
}

export function buildProxyResponseHeaders(upstreamHeaders: Headers) {
    const responseHeaders = new Headers();
    upstreamHeaders.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
            responseHeaders.set(key, value);
        }
    });
    return responseHeaders;
}
