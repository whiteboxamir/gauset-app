import { NotificationControlPlane } from "@/components/settings/NotificationControlPlane";
import { requireAuthSession } from "@/server/auth/guards";
import { getNotificationCenterForSession } from "@/server/account/notifications";

export default async function PlatformNotificationSettingsPage() {
    const session = await requireAuthSession("/app/settings/notifications");
    const snapshot = await getNotificationCenterForSession(session);

    return (
        <NotificationControlPlane preferences={snapshot.preferences} feed={snapshot.feed} />
    );
}
