import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restDelete, restSelect, restUpsert } from "@/server/db/rest";

export interface LaneHandoffRow {
    id: string;
    studio_id: string;
    domain: "workspace" | "billing" | "team" | "support" | "projects";
    summary: string | null;
    active_risks: string[] | null;
    next_actions: string[] | null;
    primary_operator_user_id: string | null;
    backup_operator_user_id: string | null;
    review_by_at: string | null;
    updated_by_user_id: string | null;
    created_at: string;
    updated_at: string;
}

export async function resolveLaneHandoffRows(studioId: string) {
    if (!isPlatformDatabaseConfigured()) {
        return [] as LaneHandoffRow[];
    }

    return restSelect<LaneHandoffRow[]>("studio_lane_handoffs", {
        select:
            "id,studio_id,domain,summary,active_risks,next_actions,primary_operator_user_id,backup_operator_user_id,review_by_at,updated_by_user_id,created_at,updated_at",
        filters: {
            studio_id: `eq.${studioId}`,
            order: "updated_at.desc",
            limit: "16",
        },
    });
}

export async function upsertLaneHandoffRow({
    studioId,
    domain,
    summary,
    activeRisks,
    nextActions,
    primaryOperatorUserId,
    backupOperatorUserId,
    reviewByAt,
    updatedByUserId,
}: {
    studioId: string;
    domain: LaneHandoffRow["domain"];
    summary: string | null;
    activeRisks: string[];
    nextActions: string[];
    primaryOperatorUserId: string | null;
    backupOperatorUserId: string | null;
    reviewByAt: string | null;
    updatedByUserId: string;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const rows = await restUpsert<LaneHandoffRow[]>(
        "studio_lane_handoffs",
        {
            studio_id: studioId,
            domain,
            summary,
            active_risks: activeRisks,
            next_actions: nextActions,
            primary_operator_user_id: primaryOperatorUserId,
            backup_operator_user_id: backupOperatorUserId,
            review_by_at: reviewByAt,
            updated_by_user_id: updatedByUserId,
        },
        {
            onConflict: "studio_id,domain",
        },
    );

    return rows[0] ?? null;
}

export async function deleteLaneHandoffRow(studioId: string, domain: LaneHandoffRow["domain"]) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const rows = await restDelete<LaneHandoffRow[]>("studio_lane_handoffs", {
        studio_id: `eq.${studioId}`,
        domain: `eq.${domain}`,
    });

    return rows[0] ?? null;
}
