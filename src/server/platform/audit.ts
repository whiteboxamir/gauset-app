import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restInsert } from "@/server/db/rest";

export async function logPlatformAuditEvent({
    actorUserId,
    actorType,
    studioId,
    targetType,
    targetId,
    eventType,
    summary,
    metadata,
}: {
    actorUserId: string | null;
    actorType: "user" | "admin" | "system";
    studioId?: string | null;
    targetType: string;
    targetId: string;
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown>;
}) {
    if (!isPlatformDatabaseConfigured()) {
        return;
    }

    try {
        await restInsert("audit_events", {
            actor_user_id: actorUserId,
            actor_type: actorType,
            studio_id: studioId ?? null,
            target_type: targetType,
            target_id: targetId,
            event_type: eventType,
            summary,
            metadata: metadata ?? {},
        });
    } catch {
        // Audit writes should not block user-facing platform actions.
    }
}
