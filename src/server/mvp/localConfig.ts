import { createHmac, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
    MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES,
    MVP_DIRECT_UPLOAD_MAX_BYTES,
    type MvpDirectUploadCapability,
} from "@/lib/mvp-upload";

const BROWSER_UPLOAD_GRANT_TTL_MS = 5 * 60 * 1000;
const BROWSER_UPLOAD_GRANT_VERSION = "gauset-browser-upload-v2";
const FALLBACK_LOCAL_BACKEND_URL = "http://127.0.0.1:8000";
const FALLBACK_LOCAL_DEV_SHARED_SECRET = "gauset-local-dev-worker-token";

type LocalEnvMap = Record<string, string>;

let cachedLocalEnv: LocalEnvMap | null = null;

function parseDotEnvFile(filePath: string) {
    if (!existsSync(filePath)) {
        return {} as LocalEnvMap;
    }

    const entries: LocalEnvMap = {};
    const source = readFileSync(filePath, "utf8");
    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        const separator = line.indexOf("=");
        if (separator <= 0) {
            continue;
        }

        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        entries[key] = value.replace(/\\n/g, "\n").trim();
    }

    return entries;
}

function resolveEnvFiles() {
    const cwd = process.cwd();
    return [
        path.join(cwd, ".env.local"),
        path.join(cwd, ".env.development.local"),
        path.resolve(cwd, "../.env.local"),
        path.resolve(cwd, "../.env.development.local"),
    ];
}

function loadLocalEnv(): LocalEnvMap {
    if (cachedLocalEnv) {
        return cachedLocalEnv;
    }

    const merged: LocalEnvMap = {};
    for (const filePath of resolveEnvFiles()) {
        Object.assign(merged, parseDotEnvFile(filePath));
    }
    for (const [key, value] of Object.entries(process.env)) {
        if (typeof value === "string" && value.trim()) {
            merged[key] = value.trim();
        }
    }

    cachedLocalEnv = merged;
    return merged;
}

function fromEnv(key: string) {
    const env = loadLocalEnv();
    return (env[key] ?? "").trim();
}

function normalizeAbsoluteHttpUrl(value: string) {
    try {
        const parsed = new URL(value.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return "";
        }
        parsed.hash = "";
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return "";
    }
}

function normalizeUploadAudience(value: string) {
    try {
        const parsed = new URL(value.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return "";
        }
        parsed.hash = "";
        parsed.search = "";
        parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
        return parsed.toString();
    } catch {
        return "";
    }
}

function buildBrowserUploadGrantMessage({
    filename,
    contentType,
    size,
    expiresAt,
    audience,
    nonce,
}: {
    filename: string;
    contentType: string;
    size: number;
    expiresAt: number;
    audience: string;
    nonce: string;
}) {
    return [BROWSER_UPLOAD_GRANT_VERSION, filename, contentType, String(size), String(expiresAt), audience, nonce].join("\n");
}

function localDevSharedSecret() {
    if (fromEnv("VERCEL") === "1") {
        return "";
    }

    return fromEnv("GAUSET_LOCAL_DEV_SHARED_SECRET") || FALLBACK_LOCAL_DEV_SHARED_SECRET;
}

export function resolveBackendBaseUrl() {
    const explicit = normalizeAbsoluteHttpUrl(fromEnv("GAUSET_BACKEND_URL") || fromEnv("NEXT_PUBLIC_GAUSET_API_BASE_URL"));
    return explicit || FALLBACK_LOCAL_BACKEND_URL;
}

export function resolveBackendWorkerToken() {
    return fromEnv("GAUSET_BACKEND_WORKER_TOKEN") || fromEnv("GAUSET_IMAGE_TO_SPLAT_BACKEND_TOKEN") || fromEnv("GAUSET_WORKER_TOKEN") || localDevSharedSecret();
}

export function resolveBrowserUploadGrantSecret() {
    return fromEnv("GAUSET_BROWSER_UPLOAD_SECRET") || resolveBackendWorkerToken() || localDevSharedSecret();
}

export function resolveBrowserDirectBackendUploadUrl() {
    const explicit = normalizeAbsoluteHttpUrl(fromEnv("GAUSET_BROWSER_BACKEND_UPLOAD_URL"));
    if (explicit) {
        return explicit.endsWith("/upload") ? explicit : `${explicit}/upload`;
    }

    const backendBaseUrl = resolveBackendBaseUrl();
    return backendBaseUrl.endsWith("/upload") ? backendBaseUrl : `${backendBaseUrl}/upload`;
}

export function resolveDirectUploadCapability(): MvpDirectUploadCapability {
    const directUploadUrl = resolveBrowserDirectBackendUploadUrl();
    const sharedSecret = resolveBrowserUploadGrantSecret();
    const directBackendReady = Boolean(directUploadUrl && sharedSecret);

    return {
        // Keep the March 17 restore on the same-origin upload bridge so refreshes
        // and local backend restarts do not surface as browser-level network errors.
        available: false,
        transport: null,
        directUploadUrl: directBackendReady ? directUploadUrl : undefined,
        allowedContentTypes: [...MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES],
        maximumSizeInBytes: MVP_DIRECT_UPLOAD_MAX_BYTES,
        legacyProxyMaximumSizeInBytes: MVP_DIRECT_UPLOAD_MAX_BYTES,
    };
}

export function parseBrowserUploadGrantRequest(raw: unknown) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {
            error: "Upload grant payload is missing.",
            payload: null as { filename: string; contentType: string; size: number } | null,
        };
    }

    const record = raw as Record<string, unknown>;
    const filename = typeof record.filename === "string" ? record.filename.trim().slice(0, 240) : "";
    const contentType = typeof record.contentType === "string" ? record.contentType.trim().toLowerCase().slice(0, 120) : "";
    const size =
        typeof record.size === "number"
            ? Math.trunc(record.size)
            : typeof record.size === "string"
              ? Number.parseInt(record.size, 10)
              : Number.NaN;

    if (!filename) {
        return {
            error: "Upload grant is missing the original filename.",
            payload: null as { filename: string; contentType: string; size: number } | null,
        };
    }

    if (!MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES.includes(contentType as (typeof MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES)[number])) {
        return {
            error: "Upload grant specified an unsupported still format.",
            payload: null as { filename: string; contentType: string; size: number } | null,
        };
    }

    if (!Number.isFinite(size) || size <= 0) {
        return {
            error: "Upload grant is missing a valid file size.",
            payload: null as { filename: string; contentType: string; size: number } | null,
        };
    }

    if (size > MVP_DIRECT_UPLOAD_MAX_BYTES) {
        return {
            error: `Upload exceeds the ${Math.round(MVP_DIRECT_UPLOAD_MAX_BYTES / (1024 * 1024))} MB intake limit.`,
            payload: null as { filename: string; contentType: string; size: number } | null,
        };
    }

    return {
        error: "",
        payload: {
            filename,
            contentType,
            size,
        },
    };
}

export function issueBrowserUploadGrant({
    filename,
    contentType,
    size,
    uploadUrl,
}: {
    filename: string;
    contentType: string;
    size: number;
    uploadUrl: string;
}) {
    const secret = resolveBrowserUploadGrantSecret();
    if (!secret) {
        throw new Error("Direct backend upload signing is unavailable in this local restore.");
    }

    const audience = normalizeUploadAudience(uploadUrl);
    if (!audience) {
        throw new Error("Direct backend upload URL is invalid.");
    }

    const expiresAt = Date.now() + BROWSER_UPLOAD_GRANT_TTL_MS;
    const nonce = randomUUID().replace(/-/g, "");
    const headers = {
        "x-gauset-upload-filename": filename,
        "x-gauset-upload-content-type": contentType,
        "x-gauset-upload-size": String(size),
        "x-gauset-upload-expires": String(expiresAt),
        "x-gauset-upload-audience": audience,
        "x-gauset-upload-nonce": nonce,
        "x-gauset-upload-signature": createHmac("sha256", secret)
            .update(
                buildBrowserUploadGrantMessage({
                    filename,
                    contentType,
                    size,
                    expiresAt,
                    audience,
                    nonce,
                }),
                "utf8",
            )
            .digest("hex"),
    };

    return {
        uploadUrl: audience,
        headers,
        expiresAt,
        maximumSizeInBytes: MVP_DIRECT_UPLOAD_MAX_BYTES,
    };
}

export function buildWorkerProxyHeaders(requestHeaders: Headers) {
    const headers = new Headers();
    requestHeaders.forEach((value, key) => {
        const normalized = key.toLowerCase();
        if (
            normalized === "connection" ||
            normalized === "content-length" ||
            normalized === "host" ||
            normalized === "transfer-encoding"
        ) {
            return;
        }
        headers.set(key, value);
    });
    headers.set("accept-encoding", "identity");

    const workerToken = resolveBackendWorkerToken();
    if (workerToken) {
        headers.set("authorization", `Bearer ${workerToken}`);
        headers.set("x-gauset-worker-token", workerToken);
    }

    return headers;
}
