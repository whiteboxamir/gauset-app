import type { AuthSession } from "@/server/contracts/auth";
import type { GovernanceSnapshot } from "@/server/contracts/governance";
import type { NotificationSubscription } from "@/server/contracts/notifications";
import type { SecurityOverview } from "@/server/contracts/security";

import { getGovernanceSnapshotForSession } from "@/server/account/governance";
import { getNotificationSubscriptionsForSession } from "@/server/account/notifications";
import { getSecurityOverviewForSession } from "@/server/account/security";

import { resolveStudioScopedSnapshot } from "./surface-loader-core";

export interface PlatformGovernanceSettingsSurfaceState {
    governanceSnapshot: GovernanceSnapshot | null;
    notificationSubscriptions: NotificationSubscription[];
}

export async function getPlatformGovernanceSettingsSurfaceForSession(
    session: AuthSession,
): Promise<PlatformGovernanceSettingsSurfaceState> {
    const hasActiveStudio = Boolean(session.activeStudioId);

    const [governanceSnapshot, notificationSubscriptions] = await Promise.all([
        resolveStudioScopedSnapshot({
            hasActiveStudio,
            loader: () => getGovernanceSnapshotForSession(session),
            fallback: null,
        }),
        resolveStudioScopedSnapshot({
            hasActiveStudio,
            loader: () => getNotificationSubscriptionsForSession(session),
            fallback: [] as NotificationSubscription[],
        }),
    ]);

    return {
        governanceSnapshot,
        notificationSubscriptions,
    };
}

export interface PlatformSecuritySettingsSurfaceState {
    securityOverview: SecurityOverview | null;
}

export async function getPlatformSecuritySettingsSurfaceForSession(
    session: AuthSession,
): Promise<PlatformSecuritySettingsSurfaceState> {
    return {
        securityOverview: await getSecurityOverviewForSession(session),
    };
}
