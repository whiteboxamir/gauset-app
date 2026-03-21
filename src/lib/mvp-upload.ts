export type MvpDirectUploadTransport = "blob" | "backend" | null;

export interface MvpDirectUploadCapability {
    available: boolean;
    transport: MvpDirectUploadTransport;
    directUploadUrl?: string;
    allowedContentTypes: readonly string[];
    maximumSizeInBytes: number;
    legacyProxyMaximumSizeInBytes: number;
    pathPrefix: string;
}

export type MvpDirectUploadCapabilitySnapshot = Pick<
    MvpDirectUploadCapability,
    "available" | "transport" | "directUploadUrl" | "maximumSizeInBytes" | "legacyProxyMaximumSizeInBytes"
>;

export const MVP_DIRECT_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
export const MVP_DIRECT_UPLOAD_MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
export const MVP_LEGACY_PROXY_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
export const MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MVP_DIRECT_UPLOAD_ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

const UNSAFE_FILENAME_CHARS = /[^a-z0-9._-]+/gi;
const REPEATED_DOTS = /\.{2,}/g;

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

export function sanitizeUploadFilename(value: string) {
    const trimmed = value.trim().toLowerCase();
    const normalized = trimmed
        .replaceAll(" ", "-")
        .replace(UNSAFE_FILENAME_CHARS, "-")
        .replace(REPEATED_DOTS, ".")
        .replace(/^-+/, "")
        .replace(/-+$/, "");

    return normalized || "source-still.png";
}

export function buildDirectUploadPath(filename: string) {
    const safeFilename = sanitizeUploadFilename(filename);
    const dayStamp = new Date().toISOString().slice(0, 10);
    return `mvp/source-stills/${dayStamp}/${safeFilename}`;
}

export function isAllowedDirectUploadContentType(value?: string | null) {
    if (!value) {
        return false;
    }
    return MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES.includes(value.toLowerCase() as (typeof MVP_DIRECT_UPLOAD_ALLOWED_CONTENT_TYPES)[number]);
}

export function hasAllowedDirectUploadExtension(filename: string) {
    const match = /\.[^.]+$/.exec(filename.toLowerCase());
    return match ? MVP_DIRECT_UPLOAD_ALLOWED_EXTENSIONS.includes(match[0] as (typeof MVP_DIRECT_UPLOAD_ALLOWED_EXTENSIONS)[number]) : false;
}

export function isAllowedBlobStoreUrl(value: string) {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" && /\.blob\.vercel-storage\.com$/i.test(parsed.hostname);
    } catch {
        return false;
    }
}
