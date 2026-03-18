"use client";

import { useMemo } from "react";

import { decodeInlineReviewPackagePayload } from "@/components/Editor/reviewExperienceShared";

export function useReviewExperienceInlinePackageController({
    payload,
    shareToken,
}: {
    payload: string | null;
    shareToken: string | null;
}) {
    return useMemo(() => {
        if (!payload) {
            return {
                inlinePackage: null,
                inlineReviewData: null,
                inlineStatusMessage: null,
            };
        }

        try {
            const inlinePackage = decodeInlineReviewPackagePayload(payload, shareToken);
            return {
                inlinePackage,
                inlineReviewData: inlinePackage.review ?? null,
                inlineStatusMessage: "Review scene loaded from inline package.",
            };
        } catch {
            return {
                inlinePackage: null,
                inlineReviewData: null,
                inlineStatusMessage: "Unable to decode the inline review package.",
            };
        }
    }, [payload, shareToken]);
}
