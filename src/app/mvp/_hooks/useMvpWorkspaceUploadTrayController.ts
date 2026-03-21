"use client";

import { upload } from "@vercel/blob/client";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { extractApiError, MVP_API_BASE_URL, toProxyUrl } from "@/lib/mvp-api";
import {
    buildDirectUploadPath,
    formatUploadBytes,
    MVP_DIRECT_UPLOAD_MAX_BYTES,
    MVP_DIRECT_UPLOAD_MULTIPART_THRESHOLD_BYTES,
    MVP_LEGACY_PROXY_UPLOAD_MAX_BYTES,
    type MvpDirectUploadTransport,
    type MvpDirectUploadCapabilitySnapshot,
} from "@/lib/mvp-upload";
import type { UploadResponse } from "@/lib/mvp-product";

import {
    isSupportedImageFile,
    truncateLabel,
    type UploadItem,
    type UploadQueueItem,
    type UploadQueueSummary,
} from "./mvpWorkspaceIntakeShared";

type DirectUploadCapabilityResponse = {
    available?: boolean;
    transport?: MvpDirectUploadTransport;
    directUploadUrl?: string;
    maximumSizeInBytes?: number;
    legacyProxyMaximumSizeInBytes?: number;
};

type ResolvedDirectUploadCapability = {
    available: boolean;
    transport: MvpDirectUploadTransport;
    directUploadUrl?: string;
    maximumSizeInBytes: number;
    legacyProxyMaximumSizeInBytes: number;
};

function parseLegacyUploadError(request: XMLHttpRequest, fallback: string) {
    const responseText = typeof request.responseText === "string" ? request.responseText : "";
    if (!responseText.trim()) {
        return fallback;
    }

    try {
        const payload = JSON.parse(responseText) as { detail?: string; message?: string };
        return payload.detail || payload.message || fallback;
    } catch {
        return fallback;
    }
}

function uploadViaLegacyProxy(file: File, onProgress: (loadedBytes: number, totalBytes: number) => void) {
    return uploadViaFormData(`${MVP_API_BASE_URL}/upload`, file, onProgress);
}

function uploadViaFormData(
    url: string,
    file: File,
    onProgress: (loadedBytes: number, totalBytes: number) => void,
    headers?: Record<string, string>,
) {
    return new Promise<UploadResponse>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("POST", url);
        request.responseType = "json";
        Object.entries(headers ?? {}).forEach(([key, value]) => {
            request.setRequestHeader(key, value);
        });
        request.upload.onprogress = (event) => {
            if (!event.lengthComputable) {
                return;
            }
            onProgress(event.loaded, event.total);
        };
        request.onerror = () => {
            reject(new Error("Upload failed (network error)"));
        };
        request.onload = () => {
            const fallback = `Upload failed (${request.status})`;
            if (request.status >= 200 && request.status < 300) {
                const payload =
                    request.response && typeof request.response === "object"
                        ? (request.response as UploadResponse)
                        : (JSON.parse(request.responseText || "{}") as UploadResponse);
                resolve(payload);
                return;
            }

            reject(new Error(parseLegacyUploadError(request, fallback)));
        };

        const formData = new FormData();
        formData.append("file", file);
        request.send(formData);
    });
}

function uploadViaDirectBackend(
    url: string,
    file: File,
    onProgress: (loadedBytes: number, totalBytes: number) => void,
    headers?: Record<string, string>,
) {
    return uploadViaFormData(url, file, onProgress, headers);
}

export function useMvpWorkspaceUploadTrayController({
    backendMode,
    backendWritesDisabled,
    backendWritesDisabledMessage,
    handleInputReady,
    initialUploadCapability,
    selectedProviderMaxReferences,
    setErrorText,
    setStatusText,
}: {
    backendMode: "checking" | "ready" | "degraded" | "offline";
    backendWritesDisabled: boolean;
    backendWritesDisabledMessage: string;
    handleInputReady: (inputLabel: string) => void;
    initialUploadCapability?: MvpDirectUploadCapabilitySnapshot;
    selectedProviderMaxReferences: number;
    setErrorText: (value: string) => void;
    setStatusText: (value: string) => void;
}) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const uploadPreviewUrlsRef = useRef<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
    const [selectedReferenceIds, setSelectedReferenceIds] = useState<string[]>([]);
    const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
    const [directUploadAvailable, setDirectUploadAvailable] = useState<boolean | null>(initialUploadCapability?.available ?? null);
    const [directUploadTransport, setDirectUploadTransport] = useState<MvpDirectUploadTransport>(initialUploadCapability?.transport ?? null);
    const [directUploadUrl, setDirectUploadUrl] = useState(initialUploadCapability?.directUploadUrl ?? "");
    const [directUploadMaximumSizeInBytes, setDirectUploadMaximumSizeInBytes] = useState(
        initialUploadCapability?.maximumSizeInBytes ?? MVP_DIRECT_UPLOAD_MAX_BYTES,
    );
    const [legacyProxyMaximumSizeInBytes, setLegacyProxyMaximumSizeInBytes] = useState(
        initialUploadCapability?.legacyProxyMaximumSizeInBytes ?? MVP_LEGACY_PROXY_UPLOAD_MAX_BYTES,
    );
    const uploadCapabilityRequestRef = useRef<Promise<ResolvedDirectUploadCapability> | null>(null);

    useEffect(() => {
        return () => {
            uploadPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        };
    }, []);

    const loadDirectUploadCapability = useCallback(async (): Promise<ResolvedDirectUploadCapability> => {
        if (backendMode === "offline" || backendWritesDisabled) {
            setDirectUploadAvailable(false);
            setDirectUploadTransport(null);
            setDirectUploadUrl("");
            setDirectUploadMaximumSizeInBytes(MVP_DIRECT_UPLOAD_MAX_BYTES);
            setLegacyProxyMaximumSizeInBytes(MVP_LEGACY_PROXY_UPLOAD_MAX_BYTES);
            return {
                available: false,
                transport: null,
                directUploadUrl: "",
                maximumSizeInBytes: MVP_DIRECT_UPLOAD_MAX_BYTES,
                legacyProxyMaximumSizeInBytes: MVP_LEGACY_PROXY_UPLOAD_MAX_BYTES,
            };
        }

        if (uploadCapabilityRequestRef.current) {
            return uploadCapabilityRequestRef.current;
        }

        uploadCapabilityRequestRef.current = fetch(`${MVP_API_BASE_URL}/upload-init`, {
            cache: "no-store",
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Upload bootstrap unavailable (${response.status})`);
                }

                const payload = (await response.json()) as DirectUploadCapabilityResponse;
                const resolvedCapability = {
                    available: Boolean(payload.available),
                    transport:
                        payload.transport === "blob" || payload.transport === "backend" || payload.transport === null
                            ? payload.transport
                            : null,
                    directUploadUrl: typeof payload.directUploadUrl === "string" ? payload.directUploadUrl : "",
                    maximumSizeInBytes:
                        typeof payload.maximumSizeInBytes === "number" && Number.isFinite(payload.maximumSizeInBytes)
                            ? payload.maximumSizeInBytes
                            : MVP_DIRECT_UPLOAD_MAX_BYTES,
                    legacyProxyMaximumSizeInBytes:
                        typeof payload.legacyProxyMaximumSizeInBytes === "number" && Number.isFinite(payload.legacyProxyMaximumSizeInBytes)
                            ? payload.legacyProxyMaximumSizeInBytes
                            : MVP_LEGACY_PROXY_UPLOAD_MAX_BYTES,
                } satisfies ResolvedDirectUploadCapability;

                setDirectUploadAvailable(resolvedCapability.available);
                setDirectUploadTransport(resolvedCapability.transport);
                setDirectUploadUrl(resolvedCapability.directUploadUrl ?? "");
                setDirectUploadMaximumSizeInBytes(resolvedCapability.maximumSizeInBytes);
                setLegacyProxyMaximumSizeInBytes(resolvedCapability.legacyProxyMaximumSizeInBytes);
                return resolvedCapability;
            })
            .catch(() => {
                const resolvedCapability = {
                    available: initialUploadCapability?.available ?? false,
                    transport: initialUploadCapability?.transport ?? null,
                    directUploadUrl: initialUploadCapability?.directUploadUrl ?? "",
                    maximumSizeInBytes: initialUploadCapability?.maximumSizeInBytes ?? MVP_DIRECT_UPLOAD_MAX_BYTES,
                    legacyProxyMaximumSizeInBytes:
                        initialUploadCapability?.legacyProxyMaximumSizeInBytes ?? MVP_LEGACY_PROXY_UPLOAD_MAX_BYTES,
                } satisfies ResolvedDirectUploadCapability;
                setDirectUploadAvailable(resolvedCapability.available);
                setDirectUploadTransport(resolvedCapability.transport);
                setDirectUploadUrl(resolvedCapability.directUploadUrl);
                setDirectUploadMaximumSizeInBytes(resolvedCapability.maximumSizeInBytes);
                setLegacyProxyMaximumSizeInBytes(resolvedCapability.legacyProxyMaximumSizeInBytes);
                return resolvedCapability;
            })
            .finally(() => {
                uploadCapabilityRequestRef.current = null;
            });

        return uploadCapabilityRequestRef.current;
    }, [backendMode, backendWritesDisabled, initialUploadCapability]);

    useEffect(() => {
        void loadDirectUploadCapability();
    }, [loadDirectUploadCapability]);

    const setUploadQueueItem = useCallback((nextItem: UploadQueueItem) => {
        setUploadQueue((previous) => {
            const next = [...previous];
            const index = next.findIndex((item) => item.id === nextItem.id);
            if (index >= 0) {
                next[index] = nextItem;
            } else {
                next.push(nextItem);
            }
            return next;
        });
    }, []);

    const selectedUpload = useMemo(
        () => uploads.find((uploadItem) => uploadItem.image_id === selectedUploadId) ?? uploads[0] ?? null,
        [selectedUploadId, uploads],
    );
    const selectedUploadAnalysis = selectedUpload?.analysis;

    useEffect(() => {
        if (!selectedUpload?.sourceName) {
            return;
        }

        handleInputReady(selectedUpload.sourceName);
    }, [handleInputReady, selectedUpload?.image_id, selectedUpload?.sourceName]);

    const triggerFilePicker = useCallback(() => {
        if (backendMode === "offline" || backendWritesDisabled) {
            return;
        }

        fileInputRef.current?.click();
    }, [backendMode, backendWritesDisabled]);

    const handleUpload = useCallback(
        async (event: ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length === 0) {
                return;
            }

            if (backendWritesDisabled) {
                setErrorText(backendWritesDisabledMessage);
                return;
            }

            setErrorText("");
            setStatusText("");
            setIsUploading(true);
            setUploadQueue([]);

            const uploadCapability =
                directUploadAvailable === null
                    ? await loadDirectUploadCapability()
                    : {
                          available: directUploadAvailable,
                          transport: directUploadTransport,
                          directUploadUrl,
                          maximumSizeInBytes: directUploadMaximumSizeInBytes,
                          legacyProxyMaximumSizeInBytes,
                      };
            const directUploadEnabled = uploadCapability.available;
            const resolvedDirectUploadTransport = uploadCapability.transport;
            const resolvedDirectUploadUrl = uploadCapability.directUploadUrl ?? "";
            const resolvedDirectUploadMaximumSizeInBytes = uploadCapability.maximumSizeInBytes;
            const resolvedLegacyProxyMaximumSizeInBytes = uploadCapability.legacyProxyMaximumSizeInBytes;

            const uploadedItems: UploadItem[] = [];
            const failures: string[] = [];

            for (let index = 0; index < files.length; index += 1) {
                const file = files[index];
                const progressId = `${Date.now()}-${index}-${file.name}`;
                const totalBytes = file.size || 1;
                const uploadTransport = directUploadEnabled ? (resolvedDirectUploadTransport ?? "legacy") : "legacy";

                if (!isSupportedImageFile(file)) {
                    failures.push(`${file.name}: unsupported file type. Use PNG, JPG, or WEBP stills.`);
                    continue;
                }

                if (file.size > resolvedDirectUploadMaximumSizeInBytes) {
                    failures.push(
                        `${file.name}: stills over ${formatUploadBytes(resolvedDirectUploadMaximumSizeInBytes)} are not accepted in this web intake path.`,
                    );
                    continue;
                }

                if (!directUploadEnabled && file.size > resolvedLegacyProxyMaximumSizeInBytes) {
                    failures.push(
                        `${file.name}: larger direct upload is unavailable here, and the fallback proxy only accepts stills up to ${formatUploadBytes(resolvedLegacyProxyMaximumSizeInBytes)}.`,
                    );
                    continue;
                }

                setUploadQueueItem({
                    id: progressId,
                    fileName: file.name,
                    sizeBytes: totalBytes,
                    progressPercent: 0,
                    transport: uploadTransport,
                    phase: "queued",
                });

                const localPreviewUrl = URL.createObjectURL(file);
                uploadPreviewUrlsRef.current.push(localPreviewUrl);

                try {
                    let payload: UploadResponse;

                    if (directUploadEnabled && resolvedDirectUploadTransport === "blob") {
                        const directBlob = await upload(buildDirectUploadPath(file.name), file, {
                            access: "public",
                            handleUploadUrl: `${MVP_API_BASE_URL}/upload-init`,
                            contentType: file.type || undefined,
                            clientPayload: JSON.stringify({
                                filename: file.name,
                                contentType: file.type || null,
                                size: file.size,
                            }),
                            multipart: file.size >= MVP_DIRECT_UPLOAD_MULTIPART_THRESHOLD_BYTES,
                            onUploadProgress: (progressEvent) => {
                                setUploadQueueItem({
                                    id: progressId,
                                    fileName: file.name,
                                    sizeBytes: progressEvent.total,
                                    progressPercent: progressEvent.percentage,
                                    transport: "blob",
                                    phase: "uploading",
                                });
                            },
                        });

                        setUploadQueueItem({
                            id: progressId,
                            fileName: file.name,
                            sizeBytes: totalBytes,
                            progressPercent: 100,
                            transport: "blob",
                            phase: "registering",
                        });

                        const completionResponse = await fetch(`${MVP_API_BASE_URL}/upload`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                blobUrl: directBlob.url,
                                pathname: directBlob.pathname,
                                filename: file.name,
                                contentType: file.type || directBlob.contentType || "image/png",
                                size: file.size,
                            }),
                        });

                        if (!completionResponse.ok) {
                            throw new Error(await extractApiError(completionResponse, `Upload failed (${completionResponse.status})`));
                        }

                        payload = (await completionResponse.json()) as UploadResponse;
                    } else if (directUploadEnabled && resolvedDirectUploadTransport === "backend" && resolvedDirectUploadUrl) {
                        const uploadTicketResponse = await fetch(`${MVP_API_BASE_URL}/upload-ticket`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                filename: file.name,
                                contentType: file.type || "image/png",
                                size: file.size,
                            }),
                        });

                        if (!uploadTicketResponse.ok) {
                            throw new Error(await extractApiError(uploadTicketResponse, `Upload failed (${uploadTicketResponse.status})`));
                        }

                        const uploadTicketPayload = (await uploadTicketResponse.json()) as {
                            uploadUrl?: string;
                            headers?: Record<string, string>;
                        };
                        const backendUploadUrl =
                            typeof uploadTicketPayload.uploadUrl === "string" && uploadTicketPayload.uploadUrl
                                ? uploadTicketPayload.uploadUrl
                                : resolvedDirectUploadUrl;
                        const backendUploadHeaders =
                            uploadTicketPayload.headers && typeof uploadTicketPayload.headers === "object" ? uploadTicketPayload.headers : undefined;

                        payload = await uploadViaDirectBackend(backendUploadUrl, file, (loadedBytes, progressTotalBytes) => {
                            const resolvedTotalBytes = progressTotalBytes || totalBytes;
                            const percentage = resolvedTotalBytes > 0 ? Math.min(100, (loadedBytes / resolvedTotalBytes) * 100) : 0;
                            setUploadQueueItem({
                                id: progressId,
                                fileName: file.name,
                                sizeBytes: resolvedTotalBytes,
                                progressPercent: percentage,
                                transport: "backend",
                                phase: "uploading",
                            });
                        }, backendUploadHeaders);
                    } else {
                        payload = await uploadViaLegacyProxy(file, (loadedBytes, progressTotalBytes) => {
                            const resolvedTotalBytes = progressTotalBytes || totalBytes;
                            const percentage = resolvedTotalBytes > 0 ? Math.min(100, (loadedBytes / resolvedTotalBytes) * 100) : 0;
                            setUploadQueueItem({
                                id: progressId,
                                fileName: file.name,
                                sizeBytes: resolvedTotalBytes,
                                progressPercent: percentage,
                                transport: "legacy",
                                phase: "uploading",
                            });
                        });
                    }

                    setUploadQueueItem({
                        id: progressId,
                        fileName: file.name,
                        sizeBytes: totalBytes,
                        progressPercent: 100,
                        transport: uploadTransport,
                        phase: "complete",
                    });

                    uploadedItems.push({
                        ...payload,
                        sourceName: file.name,
                        previewUrl: localPreviewUrl,
                        uploadedAt: new Date().toISOString(),
                    });
                } catch (error) {
                    uploadPreviewUrlsRef.current = uploadPreviewUrlsRef.current.filter((value) => value !== localPreviewUrl);
                    URL.revokeObjectURL(localPreviewUrl);
                    setUploadQueueItem({
                        id: progressId,
                        fileName: file.name,
                        sizeBytes: totalBytes,
                        progressPercent: 100,
                        transport: uploadTransport,
                        phase: "error",
                        errorMessage: error instanceof Error ? error.message : "upload failed",
                    });
                    failures.push(error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: upload failed`);
                }
            }

            if (uploadedItems.length > 0) {
                setUploads((previous) => [...uploadedItems.reverse(), ...previous]);
                setSelectedUploadId(uploadedItems[uploadedItems.length - 1].image_id);
                setStatusText(
                    uploadedItems.length === 1
                        ? `Uploaded ${uploadedItems[0].sourceName} into the world-record intake tray.`
                        : `Uploaded ${uploadedItems.length} stills into the world-record intake tray.`,
                );
            }

            if (failures.length > 0) {
                setErrorText(failures.join("\n"));
            }

            setIsUploading(false);
            setUploadQueue([]);
        },
        [
            backendWritesDisabled,
            backendWritesDisabledMessage,
            directUploadAvailable,
            directUploadMaximumSizeInBytes,
            directUploadTransport,
            directUploadUrl,
            legacyProxyMaximumSizeInBytes,
            loadDirectUploadCapability,
            setErrorText,
            setStatusText,
            setUploadQueueItem,
        ],
    );

    const uploadQueueSummary = useMemo<UploadQueueSummary>(() => {
        const completedCount = uploadQueue.filter((item) => item.phase === "complete").length;
        const activeItem =
            uploadQueue.find((item) => item.phase === "uploading" || item.phase === "registering") ??
            uploadQueue.find((item) => item.phase === "queued") ??
            null;

        return {
            activeFileName: activeItem?.fileName ?? "",
            activeTransport: activeItem?.transport ?? null,
            completedCount,
            totalCount: uploadQueue.length,
        };
    }, [uploadQueue]);

    const buildGeneratedUploadItems = useCallback((generatedImages: UploadResponse[], providerLabel?: string | null) => {
        return generatedImages.map((image, index) => ({
            ...image,
            sourceName: truncateLabel(image.prompt, 42) || `${providerLabel ?? image.provider ?? "Generated"} ${index + 1}`,
            previewUrl: toProxyUrl(image.url),
            uploadedAt: new Date().toISOString(),
        })) as UploadItem[];
    }, []);

    const appendGeneratedUploads = useCallback(
        (generatedImages: UploadResponse[], providerLabel?: string | null) => {
            const generatedItems = buildGeneratedUploadItems(generatedImages, providerLabel);

            if (generatedItems.length === 0) {
                return generatedItems;
            }

            setUploads((previous) => [...generatedItems, ...previous]);
            setSelectedUploadId(generatedItems[0].image_id);
            return generatedItems;
        },
        [buildGeneratedUploadItems],
    );

    const toggleReferenceSelection = useCallback(
        (imageId: string) => {
            setSelectedReferenceIds((previous) => {
                if (previous.includes(imageId)) {
                    return previous.filter((value) => value !== imageId);
                }
                if (selectedProviderMaxReferences > 0 && previous.length >= selectedProviderMaxReferences) {
                    return [...previous.slice(1), imageId];
                }
                return [...previous, imageId];
            });
        },
        [selectedProviderMaxReferences],
    );

    return {
        fileInputRef,
        isUploading,
        uploads,
        selectedUploadId,
        setSelectedUploadId,
        selectedUpload,
        selectedUploadAnalysis,
        selectedReferenceIds,
        setSelectedReferenceIds,
        triggerFilePicker,
        handleUpload,
        appendGeneratedUploads,
        toggleReferenceSelection,
        uploadQueue,
        uploadQueueSummary,
        directUploadAvailable,
        directUploadTransport,
        directUploadMaximumSizeInBytes,
        legacyProxyMaximumSizeInBytes,
    };
}
