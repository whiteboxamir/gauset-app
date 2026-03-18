import { withMvpShareToken } from "@/lib/mvp-api";
import { migrateSceneGraphToSceneDocument } from "@/lib/scene-graph/migrate.ts";
import type { SceneDocumentV2 } from "@/lib/scene-graph/types.ts";
import {
    serializeSceneDocumentToNormalizedPersistedSceneGraph,
    type PersistedWorkspaceSceneGraphV2,
} from "@/lib/scene-graph/workspaceAdapter.ts";

import type { SceneReviewRecord } from "@/lib/mvp-workspace";

export interface ReviewPackage {
    sceneId: string | null;
    versionId: string | null;
    sceneDocument: SceneDocumentV2;
    // Compatibility-only envelope kept for current share/export consumers.
    sceneGraph: PersistedWorkspaceSceneGraphV2;
    assetsList: any[];
    review?: SceneReviewRecord;
    exportedAt: string;
    summary: {
        assetCount: number;
        hasEnvironment: boolean;
    };
}

type ReviewPackageInput = Partial<Omit<ReviewPackage, "sceneDocument" | "sceneGraph">> & {
    sceneDocument?: unknown;
    sceneGraph?: unknown;
};

function encodeBase64(value: string) {
    if (typeof window === "undefined") {
        return Buffer.from(value, "utf-8").toString("base64");
    }
    return window.btoa(unescape(encodeURIComponent(value)));
}

function decodeBase64(value: string) {
    if (typeof window === "undefined") {
        return Buffer.from(value, "base64").toString("utf-8");
    }
    return decodeURIComponent(escape(window.atob(value)));
}

function normalizeSceneDocumentForReviewPackage(
    sceneDocumentOrGraph: SceneDocumentV2 | PersistedWorkspaceSceneGraphV2 | unknown,
    review?: SceneReviewRecord,
) {
    const nextSceneDocument = migrateSceneGraphToSceneDocument(sceneDocumentOrGraph);
    nextSceneDocument.review = review ?? nextSceneDocument.review ?? null;
    const compatibilitySceneGraph = serializeSceneDocumentToNormalizedPersistedSceneGraph(nextSceneDocument);

    return {
        sceneDocument: migrateSceneGraphToSceneDocument(compatibilitySceneGraph),
        sceneGraph: compatibilitySceneGraph,
    };
}

export function normalizeReviewPackage(reviewPackage: ReviewPackageInput): ReviewPackage {
    const review = reviewPackage.review;
    const normalizedSceneSnapshot = normalizeSceneDocumentForReviewPackage(
        reviewPackage.sceneDocument ?? reviewPackage.sceneGraph ?? {},
        review,
    );

    return {
        sceneId: typeof reviewPackage.sceneId === "string" ? reviewPackage.sceneId : null,
        versionId: typeof reviewPackage.versionId === "string" ? reviewPackage.versionId : null,
        sceneDocument: normalizedSceneSnapshot.sceneDocument,
        sceneGraph: normalizedSceneSnapshot.sceneGraph,
        assetsList: Array.isArray(reviewPackage.assetsList) ? reviewPackage.assetsList : [],
        review: normalizedSceneSnapshot.sceneDocument.review ?? review,
        exportedAt: typeof reviewPackage.exportedAt === "string" ? reviewPackage.exportedAt : new Date().toISOString(),
        summary: {
            assetCount: normalizedSceneSnapshot.sceneGraph.assets.length,
            hasEnvironment: Boolean(normalizedSceneSnapshot.sceneGraph.environment),
        },
    };
}

export function createReviewPackage(
    sceneDocument: SceneDocumentV2,
    assetsList: any[],
    sceneId: string | null,
    versionId: string | null,
    review?: SceneReviewRecord,
): ReviewPackage {
    return normalizeReviewPackage({
        sceneId,
        versionId,
        sceneDocument,
        assetsList,
        review,
        exportedAt: new Date().toISOString(),
    });
}

export function encodeReviewPackage(reviewPackage: ReviewPackage) {
    return encodeBase64(JSON.stringify(reviewPackage));
}

export function decodeReviewPackage(payload: string) {
    return normalizeReviewPackage(JSON.parse(decodeBase64(payload)));
}

function attachShareTokenToValue(value: unknown, shareToken?: string | null): unknown {
    if (!shareToken) {
        return value;
    }

    if (typeof value === "string") {
        return withMvpShareToken(value, shareToken) || value;
    }

    if (!value || typeof value !== "object") {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map((entry) => attachShareTokenToValue(entry, shareToken));
    }

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, attachShareTokenToValue(entry, shareToken)]),
    );
}

export function applyReviewShareToken(reviewPackage: ReviewPackage, shareToken?: string | null): ReviewPackage {
    if (!shareToken) {
        return reviewPackage;
    }

    return normalizeReviewPackage({
        ...reviewPackage,
        sceneDocument: attachShareTokenToValue(reviewPackage.sceneDocument, shareToken),
        sceneGraph: attachShareTokenToValue(reviewPackage.sceneGraph, shareToken),
        assetsList: attachShareTokenToValue(reviewPackage.assetsList, shareToken) as any[],
        review: attachShareTokenToValue(reviewPackage.review, shareToken) as SceneReviewRecord | undefined,
    });
}
