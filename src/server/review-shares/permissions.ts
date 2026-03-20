const REVIEW_SHARE_MANAGE_ROLES = new Set(["owner", "editor", "reviewer"]);

export function canManageProjectReviewShares(role: string | null | undefined) {
    return Boolean(role && REVIEW_SHARE_MANAGE_ROLES.has(role));
}

export function getReviewShareRolePermissions(role: string | null | undefined) {
    const canManageReviewShares = canManageProjectReviewShares(role);
    return {
        canListReviewShares: true,
        canCreateReviewShares: canManageReviewShares,
        canCopyReviewShares: canManageReviewShares,
        canRevokeReviewShares: canManageReviewShares,
        canRevealReviewSharePath: canManageReviewShares,
    } as const;
}
