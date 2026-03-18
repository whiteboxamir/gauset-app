import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

export const reviewShareTokenPayloadSchema = z.object({
    kind: z.literal("review_share"),
    version: z.literal(2),
    shareId: z.string().uuid(),
    tokenId: z.string().min(1),
    sceneId: z.string().min(1).nullable(),
    versionId: z.string().min(1).nullable(),
    allowedApiPaths: z.array(z.string().min(1)).max(12),
    storagePrefixes: z.array(z.string().min(1)).max(48),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
});

export type ReviewShareTokenPayload = z.infer<typeof reviewShareTokenPayloadSchema>;

export interface ReviewShareAccessSnapshot {
    shareId: string;
    tokenId: string;
    sceneId: string | null;
    versionId: string | null;
    allowedApiPaths: string[] | null;
    storagePrefixes: string[] | null;
    issuedAt: string;
    expiresAt: string;
    status: "active" | "revoked" | "expired";
}

export type ReviewShareAccessDecisionReason =
    | "method_not_allowed"
    | "persisted_mismatch"
    | "revoked"
    | "expired"
    | "path_not_allowed";

export interface ReviewShareAccessDecision {
    allowed: boolean;
    payload: ReviewShareTokenPayload | null;
    reason: ReviewShareAccessDecisionReason | null;
}

function encodeBase64Url(value: string) {
    return Buffer.from(value, "utf-8").toString("base64url");
}

function decodeBase64Url(value: string) {
    return Buffer.from(value, "base64url").toString("utf-8");
}

function signReviewSharePayload(serializedPayload: string, secret: string) {
    return createHmac("sha256", secret).update(serializedPayload).digest("base64url");
}

export function normalizeProxyPathValue(value: string) {
    const normalized = value.trim();
    if (!normalized) {
        return null;
    }

    if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
        try {
            const parsed = new URL(normalized);
            return normalizeProxyPathValue(parsed.pathname);
        } catch {
            return null;
        }
    }

    const [pathWithoutQuery] = normalized.split(/[?#]/, 1);
    const sanitizedPath = pathWithoutQuery?.trim() ?? normalized;

    if (sanitizedPath.startsWith("/api/mvp/")) {
        return sanitizedPath.slice("/api/mvp/".length);
    }
    if (sanitizedPath.startsWith("api/mvp/")) {
        return sanitizedPath.slice("api/mvp/".length);
    }
    if (sanitizedPath.startsWith("/")) {
        return sanitizedPath.slice(1);
    }

    return sanitizedPath;
}

export function normalizeStoragePath(value: string) {
    const normalized = normalizeProxyPathValue(value);
    if (!normalized?.startsWith("storage/")) {
        return null;
    }
    return normalized;
}

export function buildAllowedApiPaths(sceneId?: string | null, versionId?: string | null) {
    if (!sceneId || !versionId) {
        return [];
    }

    return [
        `scene/${sceneId}/versions/${versionId}`,
        `scene/${sceneId}/review`,
        `scene/${sceneId}/versions/${versionId}/comments`,
    ];
}

export function normalizeStringList(values: string[] | null | undefined) {
    return Array.from(
        new Set(
            (values ?? [])
                .map((value) => value.trim())
                .filter(Boolean),
        ),
    ).sort();
}

export function createReviewSharePayload({
    shareId,
    tokenId,
    sceneId,
    versionId,
    allowedApiPaths,
    storagePrefixes,
    issuedAt,
    expiresAt,
}: {
    shareId: string;
    tokenId: string;
    sceneId?: string | null;
    versionId?: string | null;
    allowedApiPaths: string[];
    storagePrefixes: string[];
    issuedAt: string;
    expiresAt: string;
}) {
    return reviewShareTokenPayloadSchema.parse({
        kind: "review_share",
        version: 2,
        shareId,
        tokenId,
        sceneId: sceneId?.trim() || null,
        versionId: versionId?.trim() || null,
        allowedApiPaths: normalizeStringList(allowedApiPaths),
        storagePrefixes: normalizeStringList(storagePrefixes),
        issuedAt: Date.parse(issuedAt),
        expiresAt: Date.parse(expiresAt),
    });
}

export function createSignedReviewShareToken(payload: ReviewShareTokenPayload, secret: string) {
    const serializedPayload = encodeBase64Url(JSON.stringify(payload));
    const signature = signReviewSharePayload(serializedPayload, secret);
    return `${serializedPayload}.${signature}`;
}

export function verifyReviewSharePayload(token: string, secret: string) {
    const [serializedPayload, providedSignature] = token.split(".");
    if (!serializedPayload || !providedSignature) {
        return null as ReviewShareTokenPayload | null;
    }

    const expectedSignature = signReviewSharePayload(serializedPayload, secret);
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
        return null as ReviewShareTokenPayload | null;
    }

    try {
        return reviewShareTokenPayloadSchema.parse(JSON.parse(decodeBase64Url(serializedPayload)));
    } catch {
        return null as ReviewShareTokenPayload | null;
    }
}

export function isReviewSharePathAuthorized(payload: ReviewShareTokenPayload, pathname: string) {
    const normalizedPath = normalizeProxyPathValue(pathname);
    if (!normalizedPath) {
        return false;
    }

    if (normalizedPath.startsWith("storage/")) {
        return payload.storagePrefixes.some((prefix) => normalizedPath.startsWith(prefix));
    }

    return payload.allowedApiPaths.includes(normalizedPath);
}

export function buildReviewPath({
    sceneId,
    versionId,
    inlinePayload,
    shareToken,
}: {
    sceneId?: string | null;
    versionId?: string | null;
    inlinePayload?: string | null;
    shareToken?: string | null;
}) {
    const reviewPath = new URL("/mvp/review", "https://gauset.invalid");

    if (sceneId && versionId) {
        reviewPath.searchParams.set("scene", sceneId);
        reviewPath.searchParams.set("version", versionId);
    } else if (inlinePayload) {
        reviewPath.searchParams.set("payload", inlinePayload);
    }

    if (shareToken?.trim()) {
        reviewPath.searchParams.set("share", shareToken);
    }
    return `${reviewPath.pathname}${reviewPath.search}`;
}

export function isReviewShareRowCompatible(row: ReviewShareAccessSnapshot, payload: ReviewShareTokenPayload) {
    return (
        row.shareId === payload.shareId &&
        row.tokenId === payload.tokenId &&
        row.sceneId === payload.sceneId &&
        row.versionId === payload.versionId &&
        Date.parse(row.issuedAt) === payload.issuedAt &&
        Date.parse(row.expiresAt) === payload.expiresAt &&
        JSON.stringify(normalizeStringList(row.allowedApiPaths)) === JSON.stringify(normalizeStringList(payload.allowedApiPaths)) &&
        JSON.stringify(normalizeStringList(row.storagePrefixes)) === JSON.stringify(normalizeStringList(payload.storagePrefixes))
    );
}

export function evaluateReviewShareAccess({
    payload,
    pathname,
    method,
    row,
    now = Date.now(),
}: {
    payload: ReviewShareTokenPayload;
    pathname: string;
    method: string;
    row: ReviewShareAccessSnapshot;
    now?: number;
}): ReviewShareAccessDecision {
    if (method !== "GET" && method !== "HEAD") {
        return {
            allowed: false,
            payload: null,
            reason: "method_not_allowed",
        };
    }

    if (!isReviewShareRowCompatible(row, payload)) {
        return {
            allowed: false,
            payload: null,
            reason: "persisted_mismatch",
        };
    }

    if (row.status === "revoked") {
        return {
            allowed: false,
            payload: null,
            reason: "revoked",
        };
    }

    if (row.status === "expired" || payload.expiresAt <= now) {
        return {
            allowed: false,
            payload: null,
            reason: "expired",
        };
    }

    if (!isReviewSharePathAuthorized(payload, pathname)) {
        return {
            allowed: false,
            payload: null,
            reason: "path_not_allowed",
        };
    }

    return {
        allowed: true,
        payload,
        reason: null,
    };
}
