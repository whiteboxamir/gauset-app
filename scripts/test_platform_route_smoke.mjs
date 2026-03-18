import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const workspaceRoot = process.cwd();

const pageChecks = [
    {
        file: "src/app/(app)/layout.tsx",
        tokens: ["NotificationCenterEntry", "NotificationSyncController", "getPlatformShellSurfaceForSession"],
    },
    {
        file: "src/app/(app)/app/settings/notifications/page.tsx",
        tokens: ["NotificationControlPlane"],
    },
    {
        file: "src/app/(app)/app/settings/security/page.tsx",
        tokens: ["SecuritySessionControlPanel", "AccessReasonPanel", "getPlatformSecuritySettingsSurfaceForSession"],
    },
    {
        file: "src/app/(app)/app/dashboard/page.tsx",
        tokens: ["ContinuityPanel", "ReleaseReadinessPanel", "getPlatformOpsSurfaceForSession"],
    },
    {
        file: "src/app/(app)/app/team/page.tsx",
        tokens: ["LaneHandoffPanel", "getPlatformOpsSurfaceForSession"],
    },
    {
        file: "src/app/(app)/app/support/page.tsx",
        tokens: ["ContinuitySurfacePanel", "getPlatformOpsSurfaceForSession"],
    },
    {
        file: "src/app/(app)/app/billing/page.tsx",
        tokens: ["ContinuitySurfacePanel", "getPlatformOpsSurfaceForSession"],
    },
    {
        file: "src/app/(app)/app/settings/profile/page.tsx",
        tokens: ["ContinuitySurfacePanel", "getPlatformOpsSurfaceForSession"],
    },
    {
        file: "src/app/(app)/app/settings/governance/page.tsx",
        tokens: ["GovernancePolicyPanel", "getPlatformGovernanceSettingsSurfaceForSession"],
    },
    {
        file: "src/app/(app)/app/worlds/page.tsx",
        tokens: ["ContinuitySurfacePanel", "ReleaseReadinessPanel", "listProjectReadinessCardsForSession", "getWorkspaceReleaseReadinessForSession"],
    },
    {
        file: "src/app/(app)/app/worlds/[projectId]/page.tsx",
        tokens: ["ContinuitySurfacePanel", "ReleaseReadinessPanel", "ProjectWorldLaunchPanel", "getProjectReadinessDetailForSession", "getPlatformOpsSurfaceForSession"],
    },
];

const apiChecks = [
    {
        file: "src/app/api/account/notifications/route.ts",
        tokens: ["getNotificationCenterForSession"],
    },
    {
        file: "src/app/api/account/notifications/subscriptions/route.ts",
        tokens: ["updateNotificationSubscriptionForSession"],
    },
    {
        file: "src/app/api/account/notifications/sync/route.ts",
        tokens: ["syncNotificationShellSummaryForSession"],
    },
    {
        file: "src/app/api/account/notifications/deliveries/[deliveryId]/route.ts",
        tokens: ["acknowledgeNotificationDeliveryForSession", "dismissNotificationDeliveryForSession"],
    },
    {
        file: "src/app/api/account/security/sessions/route.ts",
        tokens: ["getPlatformSecuritySessionsForSession"],
    },
    {
        file: "src/app/api/account/security/sessions/[sessionId]/route.ts",
        tokens: ["revokePlatformSessionForSession"],
    },
    {
        file: "src/app/api/platform/readiness/route.ts",
        tokens: ["canExposePlatformReadiness", "getPlatformActivationReadiness"],
    },
    {
        file: "src/app/api/account/security/revoke-others/route.ts",
        tokens: ["revokeOtherPlatformSessionsForSession"],
    },
    {
        file: "src/app/api/account/continuity/route.ts",
        tokens: ["getContinuitySnapshotForSession"],
    },
    {
        file: "src/app/api/account/continuity/lanes/[domain]/route.ts",
        tokens: ["upsertLaneHandoffForSession", "clearLaneHandoffForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/account/governance/policy/route.ts",
        tokens: ["updateGovernancePolicyForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/account/governance/access-reviews/route.ts",
        tokens: ["startAccessReviewForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/account/governance/approvals/route.ts",
        tokens: ["updateApprovalRequestForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/account/coordination/[itemKey]/route.ts",
        tokens: ["updateCoordinationItemForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/account/coverage/operators/[userId]/route.ts",
        tokens: ["updateOperatorCoverageForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/account/coverage/rebalance/[itemKey]/route.ts",
        tokens: ["applySuggestedAssigneeForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/account/coverage/operators/[userId]/handoff/route.ts",
        tokens: ["handoffSuggestedCoverageForOperatorForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/team/invitations/route.ts",
        tokens: ["inviteStudioMemberForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/team/members/[membershipId]/route.ts",
        tokens: ["updateStudioMemberForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/auth/finalize-invite/route.ts",
        tokens: ["finalizeStudioInvitationForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/support/threads/route.ts",
        tokens: ["createSupportThreadForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/support/threads/[threadId]/messages/route.ts",
        tokens: ["replyToSupportThreadForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/projects/route.ts",
        tokens: ["createProjectForSession", "listProjectReadinessCardsForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/projects/[projectId]/route.ts",
        tokens: ["getProjectReadinessDetailForSession", "updateProjectForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/projects/[projectId]/world-links/route.ts",
        tokens: ["addWorldLinkToProjectForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/projects/[projectId]/world-links/[sceneId]/handoff/route.ts",
        tokens: ["buildProjectWorldHandoffForSession", "getProjectDetailForSession"],
    },
    {
        file: "src/app/api/projects/[projectId]/review-shares/readiness/route.ts",
        tokens: ["getProjectReviewShareReadinessForSession", "getReviewShareErrorStatus"],
    },
    {
        file: "src/app/api/review-shares/route.ts",
        tokens: ["createReviewShareForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/review-shares/[shareId]/copy/route.ts",
        tokens: ["recordReviewShareCopiedForSession"],
    },
    {
        file: "src/app/api/review-shares/[shareId]/revoke/route.ts",
        tokens: ["revokeReviewShareForSession", "syncPlatformNotificationsAfterMutation"],
    },
    {
        file: "src/app/api/admin/accounts/[studioId]/credits/route.ts",
        tokens: ["grantStudioCredits", "syncPlatformNotificationsAfterStudioMutation"],
    },
    {
        file: "src/app/api/admin/support/threads/[threadId]/route.ts",
        tokens: ["updateAdminSupportThread", "syncPlatformNotificationsAfterStudioMutation"],
    },
    {
        file: "src/app/api/admin/support/threads/[threadId]/messages/route.ts",
        tokens: ["replyToSupportThreadAsAdmin", "syncPlatformNotificationsAfterStudioMutation"],
    },
    {
        file: "src/app/api/admin/flags/route.ts",
        tokens: ["setFeatureFlagAssignment", "syncPlatformNotificationsAfterStudioMutation"],
    },
    {
        file: "src/app/api/admin/account-flags/route.ts",
        tokens: ["setAccountFlagAssignment", "syncPlatformNotificationsAfterStudioMutation"],
    },
    {
        file: "src/app/api/webhooks/stripe/route.ts",
        tokens: ["handleStripeWebhookRequest", "syncPlatformNotificationsAfterStudioMutation"],
    },
    {
        file: "src/server/platform/notification-sync.ts",
        tokens: ["syncNotificationStudioStateForSession", "syncNotificationStudioStateForStudio"],
    },
];

function assertFileTokens({ file, tokens }) {
    const absolutePath = path.join(workspaceRoot, file);
    assert.equal(fs.existsSync(absolutePath), true, `${file} should exist.`);

    const source = fs.readFileSync(absolutePath, "utf8");
    for (const token of tokens) {
        assert.match(source, new RegExp(token), `${file} should include ${token}.`);
    }
}

for (const check of [...pageChecks, ...apiChecks]) {
    assertFileTokens(check);
}

console.log("Platform route smoke checks passed.");
