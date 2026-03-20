import type { StudioWorkspaceState } from "@/server/contracts/account";
import type { AuthSession } from "@/server/contracts/auth";
import type { GovernanceSnapshot } from "@/server/contracts/governance";
import type { NotificationShellSummary } from "@/server/contracts/notifications";
import type { CoordinationSnapshot } from "@/server/contracts/coordination";

import { getGovernanceSnapshotForSession } from "@/server/account/governance";
import { getNotificationShellSummaryForSession } from "@/server/account/notifications";
import { getStudioWorkspaceStateForSession } from "@/server/account/workspaces";
import { getCoordinationSnapshotForSession } from "@/server/platform/coordination";

import { resolveStudioScopedSnapshot } from "./surface-loader-core";

export interface PlatformShellSurfaceState {
    coordinationSnapshot: CoordinationSnapshot | null;
    governanceSnapshot: GovernanceSnapshot | null;
    workspaceState: StudioWorkspaceState;
    notificationSummary: NotificationShellSummary | null;
}

export async function getPlatformShellSurfaceForSession(session: AuthSession): Promise<PlatformShellSurfaceState> {
    const hasActiveStudio = Boolean(session.activeStudioId);

    const [coordinationSnapshot, governanceSnapshot, workspaceState, notificationSummary] = await Promise.all([
        resolveStudioScopedSnapshot({
            hasActiveStudio,
            loader: () => getCoordinationSnapshotForSession(session),
            fallback: null,
        }),
        resolveStudioScopedSnapshot({
            hasActiveStudio,
            loader: () => getGovernanceSnapshotForSession(session),
            fallback: null,
        }),
        getStudioWorkspaceStateForSession(session),
        resolveStudioScopedSnapshot({
            hasActiveStudio,
            loader: () => getNotificationShellSummaryForSession(session),
            fallback: null,
        }),
    ]);

    return {
        coordinationSnapshot,
        governanceSnapshot,
        workspaceState,
        notificationSummary,
    };
}
