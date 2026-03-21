export type MvpDirectUploadTransport = "backend" | "blob" | null;

export interface MvpDirectUploadCapability {
    available: boolean;
    transport: MvpDirectUploadTransport;
    directUploadUrl?: string;
    allowedContentTypes: readonly string[];
    maximumSizeInBytes: number;
    legacyProxyMaximumSizeInBytes: number;
    pathPrefix?: string;
}

export const MVP_DIRECT_UPLOAD_MAX_BYTES = 256 * 1024 * 1024;
export const MVP_LEGACY_PROXY_UPLOAD_MAX_BYTES = 256 * 1024 * 1024;
export const MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export function formatUploadBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "0 B";
    }

    if (bytes >= 1024 * 1024) {
        const megabytes = bytes / (1024 * 1024);
        const formattedMegabytes = megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1).replace(/\.0$/, "");
        return `${formattedMegabytes} MB`;
    }

    if (bytes >= 1024) {
        return `${Math.round(bytes / 1024)} KB`;
    }

    return `${Math.round(bytes)} B`;
}

export function isAllowedBlobStoreUrl(url: string) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
        return false;
    }
}
