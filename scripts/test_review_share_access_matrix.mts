import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildProjectReviewShareCreateRequest } from "../src/components/worlds/reviewShareRequest.ts";
import { reviewShareReadinessSchema } from "../src/server/contracts/review-shares.ts";
import { canUseLocalhostMvpBypass, normalizeRequestHostname, resolveRequestHostname } from "../src/server/mvp/hostPolicy.ts";
import { canManageProjectReviewShares, getReviewShareRolePermissions } from "../src/server/review-shares/permissions.ts";
import { deriveReviewShareReadiness } from "../src/server/review-shares/readiness.ts";
import { REVIEW_SHARE_DUPLICATE_WINDOW_MS, findReusableActiveReviewShare } from "../src/server/review-shares/reuse.ts";
import {
    buildReviewPath,
    createReviewSharePayload,
    createSignedReviewShareToken,
    evaluateReviewShareAccess,
    verifyReviewSharePayload,
} from "../src/server/review-shares/shareToken.ts";

function createAccessSnapshot({
    shareId,
    tokenId,
    expiresAt,
    status = "active",
}: {
    shareId: string;
    tokenId: string;
    expiresAt: string;
    status?: "active" | "revoked" | "expired";
}) {
    return {
        shareId,
        tokenId,
        sceneId: "scene_matrix",
        versionId: "version_matrix",
        allowedApiPaths: [
            "scene/scene_matrix/versions/version_matrix",
            "scene/scene_matrix/review",
            "scene/scene_matrix/versions/version_matrix/comments",
        ],
        storagePrefixes: ["storage/scenes/scene_matrix/"],
        issuedAt: "2026-03-12T00:00:00.000Z",
        expiresAt,
        status,
    } as const;
}

function testLocalhostHostPolicy() {
    assert.equal(normalizeRequestHostname("localhost:3015"), "localhost");
    assert.equal(resolveRequestHostname({ forwardedHost: "localhost:3015", hostHeader: "ignored", urlHostname: "ignored" }), "localhost");
    assert.equal(
        canUseLocalhostMvpBypass({
            bypassActive: true,
            forwardedHost: "localhost:3015",
            hostHeader: null,
            urlHostname: "preview-safe.vercel.app",
        }),
        true,
    );
    assert.equal(
        canUseLocalhostMvpBypass({
            bypassActive: true,
            forwardedHost: "preview-safe.vercel.app",
            hostHeader: "localhost:3015",
            urlHostname: "localhost",
        }),
        false,
    );
}

function testReviewPathBuilder() {
    assert.equal(
        buildReviewPath({
            sceneId: "scene_matrix",
            versionId: "version_matrix",
            inlinePayload: null,
            shareToken: null,
        }),
        "/mvp/review?scene=scene_matrix&version=version_matrix",
    );
    assert.equal(
        buildReviewPath({
            sceneId: "scene_matrix",
            versionId: "version_matrix",
            inlinePayload: null,
            shareToken: "signed-token",
        }),
        "/mvp/review?scene=scene_matrix&version=version_matrix&share=signed-token",
    );
}

function testSecureReviewShareAccessMatrix() {
    const secret = "review-share-test-secret";
    const shareId = randomUUID();
    const tokenId = randomUUID().replace(/-/g, "");
    const issuedAt = "2026-03-12T00:00:00.000Z";
    const expiresAt = "2026-03-19T00:00:00.000Z";
    const payload = createReviewSharePayload({
        shareId,
        tokenId,
        sceneId: "scene_matrix",
        versionId: "version_matrix",
        allowedApiPaths: [
            "scene/scene_matrix/versions/version_matrix",
            "scene/scene_matrix/review",
            "scene/scene_matrix/versions/version_matrix/comments",
        ],
        storagePrefixes: ["storage/scenes/scene_matrix/"],
        issuedAt,
        expiresAt,
    });
    const token = createSignedReviewShareToken(payload, secret);
    const verifiedPayload = verifyReviewSharePayload(token, secret);

    assert.ok(verifiedPayload, "Expected signed review share payload to verify.");

    const allowed = evaluateReviewShareAccess({
        payload: verifiedPayload!,
        pathname: "/api/mvp/scene/scene_matrix/versions/version_matrix",
        method: "GET",
        row: createAccessSnapshot({
            shareId,
            tokenId,
            expiresAt,
        }),
        now: Date.parse("2026-03-12T01:00:00.000Z"),
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.reason, null);

    const revoked = evaluateReviewShareAccess({
        payload: verifiedPayload!,
        pathname: "/api/mvp/scene/scene_matrix/versions/version_matrix",
        method: "GET",
        row: createAccessSnapshot({
            shareId,
            tokenId,
            expiresAt,
            status: "revoked",
        }),
        now: Date.parse("2026-03-12T01:00:00.000Z"),
    });
    assert.equal(revoked.allowed, false);
    assert.equal(revoked.reason, "revoked");

    const expired = evaluateReviewShareAccess({
        payload: verifiedPayload!,
        pathname: "/api/mvp/scene/scene_matrix/versions/version_matrix",
        method: "GET",
        row: createAccessSnapshot({
            shareId,
            tokenId,
            expiresAt,
            status: "active",
        }),
        now: Date.parse("2026-03-20T01:00:00.000Z"),
    });
    assert.equal(expired.allowed, false);
    assert.equal(expired.reason, "expired");

    const disallowedPath = evaluateReviewShareAccess({
        payload: verifiedPayload!,
        pathname: "/api/mvp/scene/scene_matrix/private-admin-dump",
        method: "GET",
        row: createAccessSnapshot({
            shareId,
            tokenId,
            expiresAt,
        }),
        now: Date.parse("2026-03-12T01:00:00.000Z"),
    });
    assert.equal(disallowedPath.allowed, false);
    assert.equal(disallowedPath.reason, "path_not_allowed");

    const disallowedMethod = evaluateReviewShareAccess({
        payload: verifiedPayload!,
        pathname: "/api/mvp/scene/scene_matrix/versions/version_matrix",
        method: "POST",
        row: createAccessSnapshot({
            shareId,
            tokenId,
            expiresAt,
        }),
        now: Date.parse("2026-03-12T01:00:00.000Z"),
    });
    assert.equal(disallowedMethod.allowed, false);
    assert.equal(disallowedMethod.reason, "method_not_allowed");
}

function testProjectReviewShareRoleMatrix() {
    const expectations: Record<string, boolean> = {
        viewer: false,
        finance: false,
        reviewer: true,
        editor: true,
        owner: true,
    };

    for (const [role, expected] of Object.entries(expectations)) {
        assert.equal(canManageProjectReviewShares(role), expected, `${role} should${expected ? "" : " not"} manage project review shares.`);

        const permissions = getReviewShareRolePermissions(role);
        assert.equal(permissions.canListReviewShares, true, `${role} should be able to list project review shares.`);
        assert.equal(permissions.canCreateReviewShares, expected, `${role} create access should match manage access.`);
        assert.equal(permissions.canCopyReviewShares, expected, `${role} copy access should match manage access.`);
        assert.equal(permissions.canRevokeReviewShares, expected, `${role} revoke access should match manage access.`);
        assert.equal(permissions.canRevealReviewSharePath, expected, `${role} sharePath visibility should match manage access.`);
    }
}

function testSavedVersionShareRequestIsIdentityOnly() {
    const request = buildProjectReviewShareCreateRequest({
        projectId: "project_matrix",
        sceneId: "scene_matrix",
        versionId: "version_matrix",
        expiresInHours: 24,
        label: "  Saved version review  ",
        note: "  Keep this pinned to the saved editor state.  ",
    });

    assert.deepEqual(request, {
        projectId: "project_matrix",
        sceneId: "scene_matrix",
        versionId: "version_matrix",
        expiresInHours: 24,
        label: "Saved version review",
        note: "Keep this pinned to the saved editor state.",
    });
    assert.deepEqual(Object.keys(request).sort(), ["expiresInHours", "label", "note", "projectId", "sceneId", "versionId"]);
    assert.equal("payload" in request, false);
    assert.equal("reviewPackage" in request, false);
}

function testDuplicateShareReuseWindow() {
    const reusable = findReusableActiveReviewShare({
        rows: [
            {
                id: "share_recent",
                project_id: "project_1",
                studio_id: "studio_1",
                created_by_user_id: "user_1",
                scene_id: "scene_matrix",
                version_id: "version_matrix",
                status: "active",
                token_id: "token_recent",
                label: "Backlot review",
                note: "Same payload",
                delivery_mode: "secure_link",
                allowed_api_paths: ["scene/scene_matrix/versions/version_matrix"],
                storage_prefixes: ["storage/scenes/scene_matrix/"],
                inline_payload: null,
                issued_at: "2026-03-12T00:00:00.000Z",
                expires_at: "2026-03-19T00:00:00.000Z",
                last_accessed_at: null,
                revoked_at: null,
                revoked_by_user_id: null,
                metadata: null,
                created_at: "2026-03-12T00:00:10.000Z",
                updated_at: "2026-03-12T00:00:10.000Z",
            },
            {
                id: "share_old",
                project_id: "project_1",
                studio_id: "studio_1",
                created_by_user_id: "user_1",
                scene_id: "scene_matrix",
                version_id: "version_matrix",
                status: "active",
                token_id: "token_old",
                label: "Backlot review",
                note: "Same payload",
                delivery_mode: "secure_link",
                allowed_api_paths: ["scene/scene_matrix/versions/version_matrix"],
                storage_prefixes: ["storage/scenes/scene_matrix/"],
                inline_payload: null,
                issued_at: "2026-03-12T00:00:00.000Z",
                expires_at: "2026-03-19T00:00:00.000Z",
                last_accessed_at: null,
                revoked_at: null,
                revoked_by_user_id: null,
                metadata: null,
                created_at: "2026-03-11T23:58:00.000Z",
                updated_at: "2026-03-11T23:58:00.000Z",
            },
        ],
        candidate: {
            projectId: "project_1",
            studioId: "studio_1",
            createdByUserId: "user_1",
            sceneId: "scene_matrix",
            versionId: "version_matrix",
            label: "Backlot review",
            note: "Same payload",
            deliveryMode: "secure_link",
            inlinePayload: null,
            allowedApiPaths: ["scene/scene_matrix/versions/version_matrix"],
            storagePrefixes: ["storage/scenes/scene_matrix/"],
        },
        now: Date.parse("2026-03-12T00:00:10.000Z") + REVIEW_SHARE_DUPLICATE_WINDOW_MS - 1,
    });
    assert.equal(reusable?.id, "share_recent");

    const outsideWindow = findReusableActiveReviewShare({
        rows: reusable ? [reusable] : [],
        candidate: {
            projectId: "project_1",
            studioId: "studio_1",
            createdByUserId: "user_1",
            sceneId: "scene_matrix",
            versionId: "version_matrix",
            label: "Backlot review",
            note: "Same payload",
            deliveryMode: "secure_link",
            inlinePayload: null,
            allowedApiPaths: ["scene/scene_matrix/versions/version_matrix"],
            storagePrefixes: ["storage/scenes/scene_matrix/"],
        },
        now: Date.parse("2026-03-12T00:00:10.000Z") + REVIEW_SHARE_DUPLICATE_WINDOW_MS + 1,
    });
    assert.equal(outsideWindow, null);
}

function testSavedVersionReuseIgnoresDirtyEditorState() {
    const shareId = randomUUID();
    const tokenId = randomUUID().replace(/-/g, "");
    const expiresAt = "2026-03-19T00:00:00.000Z";
    const savedVersionRow = {
        id: shareId,
        project_id: "project_matrix",
        studio_id: "studio_matrix",
        created_by_user_id: "user_matrix",
        scene_id: "scene_matrix",
        version_id: "version_matrix",
        status: "active",
        token_id: tokenId,
        label: "Saved version review",
        note: "Keep this pinned to the saved editor state.",
        delivery_mode: "secure_link",
        allowed_api_paths: ["scene/scene_matrix/versions/version_matrix"],
        storage_prefixes: ["storage/scenes/scene_matrix/"],
        inline_payload: null,
        issued_at: "2026-03-12T00:00:00.000Z",
        expires_at: expiresAt,
        last_accessed_at: null,
        revoked_at: null,
        revoked_by_user_id: null,
        metadata: null,
        created_at: "2026-03-12T00:00:10.000Z",
        updated_at: "2026-03-12T00:00:10.000Z",
    } as const;

    const cleanReuse = findReusableActiveReviewShare({
        rows: [savedVersionRow],
        candidate: {
            projectId: "project_matrix",
            studioId: "studio_matrix",
            createdByUserId: "user_matrix",
            sceneId: "scene_matrix",
            versionId: "version_matrix",
            label: "Saved version review",
            note: "Keep this pinned to the saved editor state.",
            deliveryMode: "secure_link",
            inlinePayload: null,
            allowedApiPaths: ["scene/scene_matrix/versions/version_matrix"],
            storagePrefixes: ["storage/scenes/scene_matrix/"],
        },
        now: Date.parse("2026-03-12T00:00:20.000Z"),
    });
    assert.equal(cleanReuse?.id, shareId);

    const dirtyEditorStateReuse = findReusableActiveReviewShare({
        rows: [savedVersionRow],
        candidate: {
            projectId: "project_matrix",
            studioId: "studio_matrix",
            createdByUserId: "user_matrix",
            sceneId: "scene_matrix",
            versionId: "version_matrix",
            label: "Saved version review",
            note: "Keep this pinned to the saved editor state.",
            deliveryMode: "secure_link",
            inlinePayload: JSON.stringify({ dirty: true, unsavedCameraPose: "editor-state" }),
            allowedApiPaths: ["scene/scene_matrix/versions/version_matrix"],
            storagePrefixes: ["storage/scenes/scene_matrix/"],
        },
        now: Date.parse("2026-03-12T00:00:20.000Z"),
    });
    assert.equal(dirtyEditorStateReuse, null);
}

function testReviewShareReadinessTruthStates() {
    const ready = reviewShareReadinessSchema.parse(
        deriveReviewShareReadiness({
            sceneId: "scene_matrix",
            versionId: "version_ready",
            versionResolved: true,
            truthSummary: {
                sourceKind: "reconstruction_scene",
                sourceLabel: "Backlot reconstruction",
                ingestRecordId: "ingest_123",
                latestVersionId: "version_ready",
                lane: "reconstruction",
                truthLabel: "Approved reconstruction",
                deliveryStatus: "ready_for_downstream",
                blockers: [],
                downstreamTargetLabel: "Unreal handoff manifest",
                downstreamTargetSummary: "Approved reconstruction package is ready for Unreal blockout handoff.",
            },
        }),
    );
    assert.equal(ready.state, "ready");
    assert.equal(ready.canCreate, true);

    const reviewOnly = reviewShareReadinessSchema.parse(
        deriveReviewShareReadiness({
            sceneId: "scene_matrix",
            versionId: "version_preview",
            versionResolved: true,
            truthSummary: {
                sourceKind: "single_image_preview",
                sourceLabel: "Scout preview",
                ingestRecordId: "ingest_preview",
                latestVersionId: "version_preview",
                lane: "preview",
                truthLabel: "Single-image preview",
                deliveryStatus: "preview_only",
                blockers: ["preview_not_reconstruction", "review_not_approved"],
                downstreamTargetLabel: null,
                downstreamTargetSummary: null,
            },
        }),
    );
    assert.equal(reviewOnly.state, "review_only");
    assert.equal(reviewOnly.canCreate, true);
    assert.match(reviewOnly.detail, /preview not reconstruction/i);

    const blocked = reviewShareReadinessSchema.parse(
        deriveReviewShareReadiness({
            sceneId: "scene_matrix",
            versionId: "version_missing",
            versionResolved: false,
            truthSummary: null,
        }),
    );
    assert.equal(blocked.state, "blocked");
    assert.equal(blocked.canCreate, false);
    assert.match(blocked.detail, /backend can load it/i);
}

testLocalhostHostPolicy();
testReviewPathBuilder();
testSecureReviewShareAccessMatrix();
testProjectReviewShareRoleMatrix();
testSavedVersionShareRequestIsIdentityOnly();
testDuplicateShareReuseWindow();
testSavedVersionReuseIgnoresDirtyEditorState();
testReviewShareReadinessTruthStates();

console.log("Review share access matrix checks passed.");
