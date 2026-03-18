import type { AuthSession } from "@/server/contracts/auth";

import { syncNotificationStudioStateForSession, syncNotificationStudioStateForStudio } from "@/server/account/notifications";

export async function syncPlatformNotificationsAfterMutation(session: AuthSession) {
    if (!session.activeStudioId) {
        return;
    }

    try {
        await syncNotificationStudioStateForSession(session);
    } catch (error) {
        console.error("platform notification sync failed after mutation", error);
    }
}

export async function syncPlatformNotificationsAfterStudioMutation({
    studioId,
    actorUserId = null,
    actorType = "system",
}: {
    studioId: string | null;
    actorUserId?: string | null;
    actorType?: "user" | "admin" | "system";
}) {
    if (!studioId) {
        return;
    }

    try {
        await syncNotificationStudioStateForStudio({
            studioId,
            actorUserId,
            actorType,
        });
    } catch (error) {
        console.error("platform notification sync failed after studio mutation", error);
    }
}
