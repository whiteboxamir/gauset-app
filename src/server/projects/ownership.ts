import type { ProjectDetail, WorldTruthSnapshot } from "@/server/projects/types";

import { createProjectForOwner, getProjectDetailForOwner, listProjectsForOwner } from "./service";
import { normalizeEmail, normalizeSceneId } from "./storage";

export interface SceneOwnershipResolution {
    sceneId: string;
    accessibleProjectId: string | null;
    linkedElsewhere: boolean;
}

export function resolveSceneOwnershipForOwner(ownerEmail: string, sceneId: string): SceneOwnershipResolution {
    const normalizedOwnerEmail = normalizeEmail(ownerEmail);
    const normalizedSceneId = normalizeSceneId(sceneId);
    const project = listProjectsForOwner(normalizedOwnerEmail).find((entry) => entry.primarySceneId === normalizedSceneId) ?? null;

    if (project) {
        return {
            sceneId: normalizedSceneId,
            accessibleProjectId: project.projectId,
            linkedElsewhere: false,
        };
    }

    const ownedProjectWithLink =
        listProjectsForOwner(normalizedOwnerEmail).find((entry) => {
            const detail = getProjectDetailForOwner(normalizedOwnerEmail, entry.projectId);
            return detail?.worldLinks.some((link) => link.sceneId === normalizedSceneId);
        }) ?? null;

    if (ownedProjectWithLink) {
        return {
            sceneId: normalizedSceneId,
            accessibleProjectId: ownedProjectWithLink.projectId,
            linkedElsewhere: false,
        };
    }

    return {
        sceneId: normalizedSceneId,
        accessibleProjectId: null,
        linkedElsewhere: false,
    };
}

function buildAutoProjectName(sceneId: string, sourceLabel?: string | null) {
    const normalizedSource = sourceLabel?.trim();
    if (normalizedSource) {
        return normalizedSource;
    }

    const suffix = sceneId.replace(/^scene_/, "").slice(0, 8) || sceneId.slice(0, 12);
    return `MVP World ${suffix}`;
}

export function ensureSceneOwnershipForOwner({
    ownerEmail,
    sceneId,
    sourceLabel,
    environmentLabel,
    worldTruth,
}: {
    ownerEmail: string;
    sceneId: string;
    sourceLabel?: string | null;
    environmentLabel?: string | null;
    worldTruth?: Partial<WorldTruthSnapshot>;
}): ProjectDetail {
    const resolution = resolveSceneOwnershipForOwner(ownerEmail, sceneId);
    if (resolution.accessibleProjectId) {
        const detail = getProjectDetailForOwner(ownerEmail, resolution.accessibleProjectId);
        if (!detail) {
            throw new Error("Owned project could not be reloaded.");
        }
        return detail;
    }

    return createProjectForOwner({
        ownerEmail,
        name: buildAutoProjectName(sceneId, sourceLabel),
        description: `Auto-provisioned project ownership for ${sceneId}.`,
        initialWorld: {
            sceneId,
            environmentLabel,
            worldTruth,
            makePrimary: true,
        },
    });
}
