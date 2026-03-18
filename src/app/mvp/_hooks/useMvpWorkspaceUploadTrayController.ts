"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { extractApiError, MVP_API_BASE_URL, toProxyUrl } from "@/lib/mvp-api";
import type { UploadResponse } from "@/lib/mvp-product";

import {
    isSupportedImageFile,
    truncateLabel,
    type UploadItem,
} from "./mvpWorkspaceIntakeShared";

export function useMvpWorkspaceUploadTrayController({
    backendMode,
    backendWritesDisabled,
    backendWritesDisabledMessage,
    handleInputReady,
    selectedProviderMaxReferences,
    setErrorText,
    setStatusText,
}: {
    backendMode: "checking" | "ready" | "degraded" | "offline";
    backendWritesDisabled: boolean;
    backendWritesDisabledMessage: string;
    handleInputReady: (inputLabel: string) => void;
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

    useEffect(() => {
        return () => {
            uploadPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        };
    }, []);

    const selectedUpload = useMemo(
        () => uploads.find((upload) => upload.image_id === selectedUploadId) ?? uploads[0] ?? null,
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

            const uploadedItems: UploadItem[] = [];
            const failures: string[] = [];

            for (const file of files) {
                if (!isSupportedImageFile(file)) {
                    failures.push(`${file.name}: unsupported file type. Use PNG, JPG, or WEBP stills.`);
                    continue;
                }

                const localPreviewUrl = URL.createObjectURL(file);
                uploadPreviewUrlsRef.current.push(localPreviewUrl);

                try {
                    const formData = new FormData();
                    formData.append("file", file);

                    const response = await fetch(`${MVP_API_BASE_URL}/upload`, {
                        method: "POST",
                        body: formData,
                    });

                    if (!response.ok) {
                        throw new Error(await extractApiError(response, `Upload failed (${response.status})`));
                    }

                    const payload = (await response.json()) as UploadResponse;
                    uploadedItems.push({
                        ...payload,
                        sourceName: file.name,
                        previewUrl: localPreviewUrl,
                        uploadedAt: new Date().toISOString(),
                    });
                } catch (error) {
                    uploadPreviewUrlsRef.current = uploadPreviewUrlsRef.current.filter((value) => value !== localPreviewUrl);
                    URL.revokeObjectURL(localPreviewUrl);
                    failures.push(error instanceof Error ? `${file.name}: ${error.message}` : `${file.name}: upload failed`);
                }
            }

            if (uploadedItems.length > 0) {
                setUploads((previous) => [...uploadedItems.reverse(), ...previous]);
                setSelectedUploadId(uploadedItems[uploadedItems.length - 1].image_id);
                setStatusText(
                    uploadedItems.length === 1
                        ? `Uploaded ${uploadedItems[0].sourceName}`
                        : `Uploaded ${uploadedItems.length} photos into the capture tray.`,
                );
            }

            if (failures.length > 0) {
                setErrorText(failures.join("\n"));
            }

            setIsUploading(false);
        },
        [backendWritesDisabled, backendWritesDisabledMessage, setErrorText, setStatusText],
    );

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
    };
}
