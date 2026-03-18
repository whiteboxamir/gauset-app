import type { AuthSession } from "@/server/contracts/auth";

import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect } from "@/server/db/rest";

import { createProjectForSession } from "./service";

interface ProjectWorldLinkRow {
    project_id: string;
    scene_id: string;
}

interface ProjectRow {
    id: string;
    owner_user_id: string;
}

interface ProjectMembershipRow {
    project_id: string;
}

export interface SceneOwnershipResolution {
    sceneId: string;
    linkedProjectIds: string[];
    accessibleProjectId: string | null;
    linkedElsewhere: boolean;
}

function hasDuplicateActiveOwnership(linkedProjectIds: string[]) {
    return linkedProjectIds.length > 1;
}

function buildAutoProjectName(sceneId: string, sourceLabel?: string | null) {
    const cleanedLabel = sourceLabel?.trim();
    if (cleanedLabel) {
        return cleanedLabel.slice(0, 80);
    }

    const suffix = sceneId.replace(/^scene_/, "").slice(0, 8) || sceneId.slice(0, 12);
    return `MVP World ${suffix}`;
}

export async function resolveSceneOwnershipForSession(
    session: AuthSession,
    sceneId: string,
): Promise<SceneOwnershipResolution> {
    if (!isPlatformDatabaseConfigured()) {
        return {
            sceneId,
            linkedProjectIds: [],
            accessibleProjectId: null,
            linkedElsewhere: false,
        };
    }

    const links = await restSelect<ProjectWorldLinkRow[]>("project_world_links", {
        select: "project_id,scene_id",
        filters: {
            scene_id: `eq.${sceneId}`,
            ownership_status: "eq.active",
            limit: "50",
        },
    });

    const linkedProjectIds = Array.from(new Set(links.map((link) => link.project_id)));
    if (linkedProjectIds.length === 0) {
        return {
            sceneId,
            linkedProjectIds,
            accessibleProjectId: null,
            linkedElsewhere: false,
        };
    }

    const [projects, memberships] = await Promise.all([
        restSelect<ProjectRow[]>("projects", {
            select: "id,owner_user_id",
            filters: {
                id: `in.(${linkedProjectIds.join(",")})`,
            },
        }),
        restSelect<ProjectMembershipRow[]>("project_memberships", {
            select: "project_id",
            filters: {
                user_id: `eq.${session.user.userId}`,
                project_id: `in.(${linkedProjectIds.join(",")})`,
            },
        }),
    ]);

    const duplicateActiveOwnership = hasDuplicateActiveOwnership(linkedProjectIds);
    const accessibleProjectId =
        linkedProjectIds.find((projectId) => memberships.some((membership) => membership.project_id === projectId)) ??
        linkedProjectIds.find((projectId) => projects.find((project) => project.id === projectId)?.owner_user_id === session.user.userId) ??
        null;

    return {
        sceneId,
        linkedProjectIds,
        accessibleProjectId,
        linkedElsewhere: Boolean(duplicateActiveOwnership || (linkedProjectIds.length > 0 && !accessibleProjectId)),
    };
}

export async function ensureSceneOwnershipForSession({
    session,
    sceneId,
    sourceLabel,
}: {
    session: AuthSession;
    sceneId: string;
    sourceLabel?: string | null;
}) {
    const resolution = await resolveSceneOwnershipForSession(session, sceneId);
    if (resolution.linkedElsewhere) {
        return {
            sceneId,
            projectId: null,
            created: false,
            linkedElsewhere: true,
        };
    }

    if (resolution.accessibleProjectId) {
        return {
            sceneId,
            projectId: resolution.accessibleProjectId,
            created: false,
            linkedElsewhere: false,
        };
    }

    const projectId = await createProjectForSession({
        session,
        name: buildAutoProjectName(sceneId, sourceLabel),
        description: `Auto-provisioned from the MVP workspace for ${sceneId}.`,
        sceneId,
        environmentLabel: sourceLabel?.trim() || "Workspace environment",
    });

    return {
        sceneId,
        projectId,
        created: true,
        linkedElsewhere: false,
    };
}
