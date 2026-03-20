import fs from "fs/promises";
import path from "path";

import { upload as uploadToBlob } from "@vercel/blob/client";

const DIRECT_UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
const DIRECT_UPLOAD_MULTIPART_THRESHOLD_BYTES = 8 * 1024 * 1024;
const UNSAFE_FILENAME_CHARS = /[^a-z0-9._-]+/gi;
const REPEATED_DOTS = /\.{2,}/g;

function buildApiUrl(baseUrl, pathname) {
    return new URL(pathname, baseUrl).toString();
}

function parseJsonText(text) {
    if (!text) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

async function jsonFetch(url, init) {
    const response = await fetch(url, init);
    const text = await response.text();
    return {
        response,
        payload: parseJsonText(text),
    };
}

function sanitizeUploadFilename(value) {
    const trimmed = String(value || "").trim().toLowerCase();
    const normalized = trimmed
        .replaceAll(" ", "-")
        .replace(UNSAFE_FILENAME_CHARS, "-")
        .replace(REPEATED_DOTS, ".")
        .replace(/^-+/, "")
        .replace(/-+$/, "");

    return normalized || "source-still.png";
}

function buildDirectUploadPath(filename) {
    const dayStamp = new Date().toISOString().slice(0, 10);
    return `mvp/source-stills/${dayStamp}/${sanitizeUploadFilename(filename)}`;
}

function inferContentType(filename) {
    const extension = path.extname(filename).toLowerCase();
    if (extension === ".png") {
        return "image/png";
    }
    if (extension === ".jpg" || extension === ".jpeg") {
        return "image/jpeg";
    }
    if (extension === ".webp") {
        return "image/webp";
    }
    return "application/octet-stream";
}

function normalizeHeaders(headers) {
    return headers && typeof headers === "object" ? headers : {};
}

async function uploadViaLegacyProxy(baseUrl, file, headers) {
    const formData = new FormData();
    formData.set("file", file, file.name);
    const { response, payload } = await jsonFetch(buildApiUrl(baseUrl, "/api/mvp/upload"), {
        method: "POST",
        headers,
        body: formData,
    });
    if (!response.ok) {
        throw new Error(`legacy upload failed: ${response.status} ${JSON.stringify(payload)}`);
    }
    return payload;
}

async function uploadViaDirectBackend(baseUrl, file, capability, headers) {
    const ticket = await jsonFetch(buildApiUrl(baseUrl, "/api/mvp/upload-ticket"), {
        method: "POST",
        headers: {
            ...headers,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
        }),
    });
    if (!ticket.response.ok) {
        throw new Error(`upload ticket failed: ${ticket.response.status} ${JSON.stringify(ticket.payload)}`);
    }

    const uploadUrl =
        typeof ticket.payload?.uploadUrl === "string" && ticket.payload.uploadUrl
            ? ticket.payload.uploadUrl
            : capability.directUploadUrl;
    if (!uploadUrl) {
        throw new Error("upload ticket did not include a backend upload URL.");
    }

    const formData = new FormData();
    formData.set("file", file, file.name);
    const uploadResponse = await jsonFetch(uploadUrl, {
        method: "POST",
        headers: normalizeHeaders(ticket.payload?.headers),
        body: formData,
    });
    if (!uploadResponse.response.ok) {
        throw new Error(`direct backend upload failed: ${uploadResponse.response.status} ${JSON.stringify(uploadResponse.payload)}`);
    }
    return uploadResponse.payload;
}

async function uploadViaBlob(baseUrl, file, headers) {
    const directBlob = await uploadToBlob(buildDirectUploadPath(file.name), file, {
        access: "public",
        handleUploadUrl: buildApiUrl(baseUrl, "/api/mvp/upload-init"),
        contentType: file.type,
        clientPayload: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            size: file.size,
        }),
        multipart: file.size >= DIRECT_UPLOAD_MULTIPART_THRESHOLD_BYTES,
        headers,
    });

    const completion = await jsonFetch(buildApiUrl(baseUrl, "/api/mvp/upload"), {
        method: "POST",
        headers: {
            ...headers,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            blobUrl: directBlob.url,
            pathname: directBlob.pathname,
            filename: file.name,
            contentType: file.type || directBlob.contentType || "image/png",
            size: file.size,
        }),
    });
    if (!completion.response.ok) {
        throw new Error(`blob upload completion failed: ${completion.response.status} ${JSON.stringify(completion.payload)}`);
    }
    return completion.payload;
}

export async function resolveMvpUploadCapability(baseUrl, options = {}) {
    const capability = await jsonFetch(buildApiUrl(baseUrl, "/api/mvp/upload-init"), {
        cache: "no-store",
        headers: normalizeHeaders(options.headers),
    });
    if (!capability.response.ok) {
        throw new Error(`upload capability probe failed: ${capability.response.status} ${JSON.stringify(capability.payload)}`);
    }
    return capability.payload;
}

export async function uploadStillToMvp(baseUrl, { bytes, filename, contentType, headers = {} }) {
    const resolvedHeaders = normalizeHeaders(headers);
    const resolvedContentType = contentType || inferContentType(filename);
    const file = new File([bytes], filename, {
        type: resolvedContentType,
        lastModified: Date.now(),
    });

    if (file.size > DIRECT_UPLOAD_MAX_BYTES) {
        throw new Error(`upload exceeds the ${Math.round(DIRECT_UPLOAD_MAX_BYTES / (1024 * 1024))} MB direct intake limit.`);
    }

    const capability = await resolveMvpUploadCapability(baseUrl, { headers: resolvedHeaders });
    if (capability?.available && capability.transport === "blob") {
        return {
            transport: "blob",
            capability,
            payload: await uploadViaBlob(baseUrl, file, resolvedHeaders),
        };
    }
    if (capability?.available && capability.transport === "backend" && capability.directUploadUrl) {
        return {
            transport: "backend",
            capability,
            payload: await uploadViaDirectBackend(baseUrl, file, capability, resolvedHeaders),
        };
    }
    return {
        transport: "legacy",
        capability,
        payload: await uploadViaLegacyProxy(baseUrl, file, resolvedHeaders),
    };
}

export async function uploadStillFixtureToMvp(baseUrl, filePath, options = {}) {
    const bytes = await fs.readFile(filePath);
    return uploadStillToMvp(baseUrl, {
        bytes,
        filename: options.filename || path.basename(filePath),
        contentType: options.contentType || inferContentType(filePath),
        headers: options.headers,
    });
}
