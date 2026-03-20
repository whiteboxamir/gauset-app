import type { StudioWorkspaceState } from "@/server/contracts/account";
import type { AuthSession } from "@/server/contracts/auth";
import type { ContinuitySnapshot } from "@/server/contracts/continuity";
import type { CoordinationSnapshot } from "@/server/contracts/coordination";
import type { GovernanceSnapshot } from "@/server/contracts/governance";
import type { NotificationSubscription } from "@/server/contracts/notifications";
import type { AccessReasonSummary } from "@/server/contracts/security";

import { getGovernanceSnapshotForSession } from "@/server/account/governance";
import { getNotificationSubscriptionsForSession } from "@/server/account/notifications";
import { getAccessReasonSummariesForSession } from "@/server/account/security";
import { getStudioWorkspaceStateForSession } from "@/server/account/workspaces";
import { getContinuitySnapshotForSession } from "@/server/platform/continuity";
import { getCoordinationSnapshotForSession } from "@/server/platform/coordination";

import { resolveStudioScopedSnapshot } from "./surface-loader-core";

export interface PlatformOpsSurfaceOptions {
    governance?: boolean;
    continuity?: boolean;
    notificationSubscriptions?: boolean;
    accessReasons?: boolean;
    workspaceState?: boolean;
}

export interface PlatformOpsSurfaceState {
    coordinationSnapshot: CoordinationSnapshot | null;
    governanceSnapshot: GovernanceSnapshot | null;
    continuitySnapshot: ContinuitySnapshot | null;
    notificationSubscriptions: NotificationSubscription[];
    accessReasons: AccessReasonSummary[];
    workspaceState: StudioWorkspaceState | null;
}

export async function getPlatformOpsSurfaceForSession(
    session: AuthSession,
    options: PlatformOpsSurfaceOptions,
): Promise<PlatformOpsSurfaceState> {
    const hasActiveStudio = Boolean(session.activeStudioId);

    const [coordinationSnapshot, governanceSnapshot, continuitySnapshot, notificationSubscriptions, accessReasons, workspaceState] =
        await Promise.all([
            resolveStudioScopedSnapshot({
                hasActiveStudio,
                loader: () => getCoordinationSnapshotForSession(session),
                fallback: null,
            }),
            resolveStudioScopedSnapshot({
                enabled: options.governance,
                hasActiveStudio,
                loader: () => getGovernanceSnapshotForSession(session),
                fallback: null,
            }),
            resolveStudioScopedSnapshot({
                enabled: options.continuity,
                hasActiveStudio,
                loader: () => getContinuitySnapshotForSession(session),
                fallback: null,
            }),
            resolveStudioScopedSnapshot({
                enabled: options.notificationSubscriptions,
                hasActiveStudio,
                loader: () => getNotificationSubscriptionsForSession(session),
                fallback: [] as NotificationSubscription[],
            }),
            options.accessReasons ? Promise.resolve(getAccessReasonSummariesForSession(session)) : Promise.resolve([] as AccessReasonSummary[]),
            options.workspaceState ? getStudioWorkspaceStateForSession(session) : Promise.resolve(null),
        ]);

    return {
        coordinationSnapshot,
        governanceSnapshot,
        continuitySnapshot,
        notificationSubscriptions,
        accessReasons,
        workspaceState,
    };
}
