import { expect, test } from "@playwright/test";

import { buildProjectReviewShareCreateRequest } from "@/components/worlds/reviewShareRequest";
import { createReviewShareRequestSchema, reviewShareSummarySchema } from "@/server/contracts/review-shares";
import { canManageProjectReviewShares, getReviewShareRolePermissions } from "@/server/review-shares/permissions";

test("review-share role matrix keeps list access open and write access restricted", () => {
    const expectations: Array<[string, boolean]> = [
        ["viewer", false],
        ["finance", false],
        ["reviewer", true],
        ["editor", true],
        ["owner", true],
    ];

    for (const [role, canManage] of expectations) {
        expect(canManageProjectReviewShares(role)).toBe(canManage);

        const permissions = getReviewShareRolePermissions(role);
        expect(permissions.canListReviewShares).toBe(true);
        expect(permissions.canCreateReviewShares).toBe(canManage);
        expect(permissions.canCopyReviewShares).toBe(canManage);
        expect(permissions.canRevokeReviewShares).toBe(canManage);
        expect(permissions.canRevealReviewSharePath).toBe(canManage);
    }
});

test("saved-version review share requests only carry identity fields", () => {
    const request = buildProjectReviewShareCreateRequest({
        projectId: "22222222-2222-4222-8222-222222222222",
        sceneId: "scene_matrix",
        versionId: "version_matrix",
        expiresInHours: 24,
        label: "  Design-partner pass  ",
        note: "  Keep this pinned to the saved version.  ",
    });

    expect(request).toEqual({
        projectId: "22222222-2222-4222-8222-222222222222",
        sceneId: "scene_matrix",
        versionId: "version_matrix",
        expiresInHours: 24,
        label: "Design-partner pass",
        note: "Keep this pinned to the saved version.",
    });

    expect(Object.keys(request).sort()).toEqual(["expiresInHours", "label", "note", "projectId", "sceneId", "versionId"]);
    expect(request).not.toHaveProperty("payload");
    expect(request).not.toHaveProperty("reviewPackage");
    expect(request).not.toHaveProperty("sceneDocument");
    expect(request).not.toHaveProperty("sceneGraph");
    expect(request).not.toHaveProperty("assetsList");

    const parsed = createReviewShareRequestSchema.parse(request);
    expect(parsed.sceneId).toBe("scene_matrix");
    expect(parsed.versionId).toBe("version_matrix");
    expect(parsed.payload).toBeUndefined();
});

test("review-share summaries allow read-only rows without a fresh sharePath", () => {
    const summary = reviewShareSummarySchema.parse({
        id: "33333333-3333-4333-8333-333333333333",
        projectId: "22222222-2222-4222-8222-222222222222",
        studioId: "44444444-4444-4444-8444-444444444444",
        createdByUserId: "55555555-5555-4555-8555-555555555555",
        createdByLabel: "Viewer",
        sceneId: "scene_matrix",
        versionId: "version_matrix",
        status: "active",
        tokenId: "token_123",
        label: "Read-only history",
        note: null,
        deliveryMode: "secure_link",
        contentMode: "saved_version",
        issuedAt: "2026-03-17T10:00:00.000Z",
        expiresAt: "2026-03-24T10:00:00.000Z",
        lastAccessedAt: null,
        revokedAt: null,
        createdAt: "2026-03-17T10:00:00.000Z",
        sharePath: null,
        recentEvents: [],
    });

    expect(summary.sharePath).toBeNull();
});
