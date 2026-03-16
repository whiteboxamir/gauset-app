import { randomUUID } from "node:crypto";

import type { DeliveryPosture, ProjectActivityEvent, ProjectCard, ProjectDetail, ProjectStatus, ProjectWorldLink, WorldTruthSnapshot } from "@/server/projects/types";
import { createWorldTruthSnapshot } from "@/server/projects/types";

import { cleanText, ensureProjectStorage, normalizeEmail, normalizeSceneId, nowIso, parseMetadata } from "./storage";

interface ProjectRow {
    id: string;
    owner_email: string;
    name: string;
    slug: string;
    description: string | null;
    status: ProjectStatus;
    created_at: string;
    updated_at: string;
    last_activity_at: string | null;
    last_world_opened_at: string | null;
}

interface ProjectWorldLinkRow {
    id: string;
    project_id: string;
    scene_id: string;
    environment_label: string | null;
    source_kind: WorldTruthSnapshot["sourceKind"];
    source_label: string | null;
    lane_kind: WorldTruthSnapshot["laneKind"];
    lane_label: string | null;
    delivery_posture: DeliveryPosture;
    delivery_label: string | null;
    delivery_summary: string | null;
    is_primary: number;
    created_at: string;
    updated_at: string;
    last_reopened_at: string | null;
    reopen_count: number;
}

interface ProjectActivityEventRow {
    id: string;
    project_id: string;
    actor_email: string | null;
    event_type: string;
    summary: string;
    metadata_json: string | null;
    created_at: string;
}

interface CreateProjectInput {
    ownerEmail: string;
    name: string;
    description?: string | null;
    initialWorld?: {
        sceneId: string;
        environmentLabel?: string | null;
        worldTruth?: Partial<WorldTruthSnapshot>;
        makePrimary?: boolean;
    };
}

interface UpdateProjectInput {
    ownerEmail: string;
    projectId: string;
    name?: string;
    description?: string | null;
    status?: ProjectStatus;
}

interface AddWorldLinkInput {
    ownerEmail: string;
    projectId: string;
    sceneId: string;
    environmentLabel?: string | null;
    worldTruth?: Partial<WorldTruthSnapshot>;
    makePrimary?: boolean;
}

interface RecordWorldOpenInput {
    ownerEmail: string;
    projectId: string;
    sceneId: string;
    openedFrom?: string | null;
    versionId?: string | null;
}

function database() {
    return ensureProjectStorage();
}

function slugify(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}

function makeProjectSlug(name: string) {
    const stem = slugify(name) || "project";
    return `${stem}-${Math.random().toString(36).slice(2, 8)}`;
}

function mapWorldLinkRow(row: ProjectWorldLinkRow): ProjectWorldLink {
    return {
        id: row.id,
        projectId: row.project_id,
        sceneId: row.scene_id,
        environmentLabel: row.environment_label,
        isPrimary: row.is_primary === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastReopenedAt: row.last_reopened_at,
        reopenCount: row.reopen_count,
        worldTruth: createWorldTruthSnapshot({
            sourceKind: row.source_kind,
            sourceLabel: row.source_label,
            laneKind: row.lane_kind,
            laneLabel: row.lane_label,
            deliveryPosture: row.delivery_posture,
            deliveryLabel: row.delivery_label,
            deliverySummary: row.delivery_summary,
        }),
    };
}

function mapActivityRow(row: ProjectActivityEventRow): ProjectActivityEvent {
    return {
        id: row.id,
        projectId: row.project_id,
        actorEmail: row.actor_email,
        eventType: row.event_type,
        summary: row.summary,
        metadata: parseMetadata(row.metadata_json),
        createdAt: row.created_at,
    };
}

function mapProjectCard(row: ProjectRow, worldLinks: ProjectWorldLink[]): ProjectCard {
    const primaryLink = worldLinks.find((entry) => entry.isPrimary) ?? worldLinks[0] ?? null;

    return {
        projectId: row.id,
        ownerEmail: row.owner_email,
        name: row.name,
        slug: row.slug,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastActivityAt: row.last_activity_at,
        lastWorldOpenedAt: row.last_world_opened_at,
        worldCount: worldLinks.length,
        primarySceneId: primaryLink?.sceneId ?? null,
        primaryEnvironmentLabel: primaryLink?.environmentLabel ?? null,
        primaryWorldTruth: primaryLink?.worldTruth ?? null,
    };
}

function listWorldLinkRowsForProject(projectId: string) {
    return database()
        .prepare(
            `
                SELECT
                    id,
                    project_id,
                    scene_id,
                    environment_label,
                    source_kind,
                    source_label,
                    lane_kind,
                    lane_label,
                    delivery_posture,
                    delivery_label,
                    delivery_summary,
                    is_primary,
                    created_at,
                    updated_at,
                    last_reopened_at,
                    reopen_count
                FROM project_world_links
                WHERE project_id = ?
                ORDER BY is_primary DESC, created_at DESC
            `,
        )
        .all(projectId) as ProjectWorldLinkRow[];
}

function listActivityRowsForProject(projectId: string, limit = 20) {
    return database()
        .prepare(
            `
                SELECT
                    id,
                    project_id,
                    actor_email,
                    event_type,
                    summary,
                    metadata_json,
                    created_at
                FROM project_activity_events
                WHERE project_id = ?
                ORDER BY created_at DESC
                LIMIT ?
            `,
        )
        .all(projectId, limit) as ProjectActivityEventRow[];
}

function getOwnedProjectRow(projectId: string, ownerEmail: string) {
    const normalizedOwnerEmail = normalizeEmail(ownerEmail);
    return (
        database()
            .prepare(
                `
                    SELECT
                        id,
                        owner_email,
                        name,
                        slug,
                        description,
                        status,
                        created_at,
                        updated_at,
                        last_activity_at,
                        last_world_opened_at
                    FROM projects
                    WHERE id = ? AND owner_email = ?
                `,
            )
            .get(projectId, normalizedOwnerEmail) as ProjectRow | undefined
    ) ?? null;
}

function getAnyWorldLinkBySceneId(sceneId: string) {
    return (
        database()
            .prepare(
                `
                    SELECT
                        id,
                        project_id,
                        scene_id,
                        environment_label,
                        source_kind,
                        source_label,
                        lane_kind,
                        lane_label,
                        delivery_posture,
                        delivery_label,
                        delivery_summary,
                        is_primary,
                        created_at,
                        updated_at,
                        last_reopened_at,
                        reopen_count
                    FROM project_world_links
                    WHERE scene_id = ?
                `,
            )
            .get(sceneId) as ProjectWorldLinkRow | undefined
    ) ?? null;
}

function getWorldLinkRowForProject(projectId: string, sceneId: string) {
    return (
        database()
            .prepare(
                `
                    SELECT
                        id,
                        project_id,
                        scene_id,
                        environment_label,
                        source_kind,
                        source_label,
                        lane_kind,
                        lane_label,
                        delivery_posture,
                        delivery_label,
                        delivery_summary,
                        is_primary,
                        created_at,
                        updated_at,
                        last_reopened_at,
                        reopen_count
                    FROM project_world_links
                    WHERE project_id = ? AND scene_id = ?
                `,
            )
            .get(projectId, sceneId) as ProjectWorldLinkRow | undefined
    ) ?? null;
}

function touchProject(projectId: string, at: string, lastWorldOpenedAt?: string | null) {
    database()
        .prepare(
            `
                UPDATE projects
                SET
                    updated_at = ?,
                    last_activity_at = ?,
                    last_world_opened_at = COALESCE(?, last_world_opened_at)
                WHERE id = ?
            `,
        )
        .run(at, at, lastWorldOpenedAt ?? null, projectId);
}

export function appendProjectActivity({
    projectId,
    actorEmail,
    eventType,
    summary,
    metadata,
    createdAt,
}: {
    projectId: string;
    actorEmail?: string | null;
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown> | null;
    createdAt?: string;
}) {
    const timestamp = createdAt ?? nowIso();

    database()
        .prepare(
            `
                INSERT INTO project_activity_events (
                    id,
                    project_id,
                    actor_email,
                    event_type,
                    summary,
                    metadata_json,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
        )
        .run(
            randomUUID(),
            projectId,
            actorEmail ? normalizeEmail(actorEmail) : null,
            eventType,
            summary,
            metadata ? JSON.stringify(metadata) : null,
            timestamp,
        );
}

function assertSceneAvailableForProject(sceneId: string, projectId: string, ownerEmail: string) {
    const existingLink = getAnyWorldLinkBySceneId(sceneId);
    if (!existingLink) {
        return;
    }

    if (existingLink.project_id === projectId) {
        return;
    }

    const existingProject = database()
        .prepare("SELECT owner_email, name FROM projects WHERE id = ?")
        .get(existingLink.project_id) as { owner_email: string; name: string } | undefined;

    if (!existingProject) {
        throw new Error("Scene is already linked to another project.");
    }

    if (existingProject.owner_email === normalizeEmail(ownerEmail)) {
        throw new Error(`Scene is already linked to another project you own (${existingProject.name}). Reopen that project instead.`);
    }

    throw new Error("Scene is already owned by another operator.");
}

export function listProjectsForOwner(ownerEmail: string): ProjectCard[] {
    const normalizedOwnerEmail = normalizeEmail(ownerEmail);
    const projectRows = database()
        .prepare(
            `
                SELECT
                    id,
                    owner_email,
                    name,
                    slug,
                    description,
                    status,
                    created_at,
                    updated_at,
                    last_activity_at,
                    last_world_opened_at
                FROM projects
                WHERE owner_email = ?
                ORDER BY COALESCE(last_activity_at, created_at) DESC
            `,
        )
        .all(normalizedOwnerEmail) as ProjectRow[];

    return projectRows.map((row) => mapProjectCard(row, listWorldLinkRowsForProject(row.id).map(mapWorldLinkRow)));
}

export function getProjectDetailForOwner(ownerEmail: string, projectId: string): ProjectDetail | null {
    const projectRow = getOwnedProjectRow(projectId, ownerEmail);
    if (!projectRow) {
        return null;
    }

    const worldLinks = listWorldLinkRowsForProject(projectId).map(mapWorldLinkRow);
    const activity = listActivityRowsForProject(projectId).map(mapActivityRow);

    return {
        project: mapProjectCard(projectRow, worldLinks),
        worldLinks,
        activity,
    };
}

export function createProjectForOwner(input: CreateProjectInput): ProjectDetail {
    const normalizedOwnerEmail = normalizeEmail(input.ownerEmail);
    const projectName = cleanText(input.name);

    if (!projectName) {
        throw new Error("Project name is required.");
    }

    const projectId = randomUUID();
    const createdAt = nowIso();
    const initialWorldTruth = input.initialWorld ? createWorldTruthSnapshot(input.initialWorld.worldTruth) : null;
    const initialSceneId = input.initialWorld?.sceneId ? normalizeSceneId(input.initialWorld.sceneId) : null;

    if (initialSceneId) {
        assertSceneAvailableForProject(initialSceneId, projectId, normalizedOwnerEmail);
    }

    const transaction = database().transaction(() => {
        database()
            .prepare(
                `
                    INSERT INTO projects (
                        id,
                        owner_email,
                        name,
                        slug,
                        description,
                        status,
                        created_at,
                        updated_at,
                        last_activity_at,
                        last_world_opened_at
                    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL)
                `,
            )
            .run(projectId, normalizedOwnerEmail, projectName, makeProjectSlug(projectName), cleanText(input.description), createdAt, createdAt, createdAt);

        if (initialSceneId && initialWorldTruth) {
            database()
                .prepare(
                    `
                        INSERT INTO project_world_links (
                            id,
                            project_id,
                            scene_id,
                            environment_label,
                            source_kind,
                            source_label,
                            lane_kind,
                            lane_label,
                            delivery_posture,
                            delivery_label,
                            delivery_summary,
                            is_primary,
                            created_at,
                            updated_at,
                            last_reopened_at,
                            reopen_count
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, NULL, 0)
                    `,
                )
                .run(
                    randomUUID(),
                    projectId,
                    initialSceneId,
                    cleanText(input.initialWorld?.environmentLabel),
                    initialWorldTruth.sourceKind,
                    initialWorldTruth.sourceLabel,
                    initialWorldTruth.laneKind,
                    initialWorldTruth.laneLabel,
                    initialWorldTruth.deliveryPosture,
                    initialWorldTruth.deliveryLabel,
                    initialWorldTruth.deliverySummary,
                    createdAt,
                    createdAt,
                );
        }

        appendProjectActivity({
            projectId,
            actorEmail: normalizedOwnerEmail,
            eventType: "project.created",
            summary: initialSceneId
                ? `Created project ${projectName} and claimed MVP world ${initialSceneId}.`
                : `Created project ${projectName}.`,
            metadata: initialSceneId
                ? {
                      sceneId: initialSceneId,
                      projectId,
                  }
                : {
                      projectId,
                  },
            createdAt,
        });
    });

    transaction();

    const detail = getProjectDetailForOwner(normalizedOwnerEmail, projectId);
    if (!detail) {
        throw new Error("Project was created but could not be reloaded.");
    }

    return detail;
}

export function updateProjectForOwner(input: UpdateProjectInput): ProjectDetail {
    const detail = getProjectDetailForOwner(input.ownerEmail, input.projectId);
    if (!detail) {
        throw new Error("Project not found or access denied.");
    }

    const nextName = input.name === undefined ? detail.project.name : cleanText(input.name);
    const nextDescription = input.description === undefined ? detail.project.description : cleanText(input.description);
    if (!nextName) {
        throw new Error("Project name is required.");
    }

    const updatedAt = nowIso();
    database()
        .prepare(
            `
                UPDATE projects
                SET
                    name = ?,
                    description = ?,
                    status = ?,
                    updated_at = ?,
                    last_activity_at = ?
                WHERE id = ?
            `,
        )
        .run(nextName, nextDescription, input.status ?? detail.project.status, updatedAt, updatedAt, input.projectId);

    appendProjectActivity({
        projectId: input.projectId,
        actorEmail: input.ownerEmail,
        eventType: "project.updated",
        summary: `Updated project ${nextName}.`,
        metadata: {
            status: input.status ?? detail.project.status,
        },
        createdAt: updatedAt,
    });

    const nextDetail = getProjectDetailForOwner(input.ownerEmail, input.projectId);
    if (!nextDetail) {
        throw new Error("Project update completed but the project could not be reloaded.");
    }

    return nextDetail;
}

export function addOrRefreshWorldLinkForOwner(input: AddWorldLinkInput): ProjectDetail {
    const detail = getProjectDetailForOwner(input.ownerEmail, input.projectId);
    if (!detail) {
        throw new Error("Project not found or access denied.");
    }

    const normalizedSceneId = normalizeSceneId(input.sceneId);
    if (!normalizedSceneId) {
        throw new Error("sceneId is required.");
    }

    assertSceneAvailableForProject(normalizedSceneId, input.projectId, input.ownerEmail);

    const worldTruth = createWorldTruthSnapshot(input.worldTruth);
    const existingLink = getWorldLinkRowForProject(input.projectId, normalizedSceneId);
    const shouldBePrimary = input.makePrimary ?? (!existingLink && detail.worldLinks.length === 0);
    const timestamp = nowIso();

    const transaction = database().transaction(() => {
        if (shouldBePrimary) {
            database().prepare("UPDATE project_world_links SET is_primary = 0 WHERE project_id = ?").run(input.projectId);
        }

        if (existingLink) {
            const nextEnvironmentLabel = input.environmentLabel === undefined ? existingLink.environment_label : cleanText(input.environmentLabel);
            database()
                .prepare(
                    `
                        UPDATE project_world_links
                        SET
                            environment_label = ?,
                            source_kind = ?,
                            source_label = ?,
                            lane_kind = ?,
                            lane_label = ?,
                            delivery_posture = ?,
                            delivery_label = ?,
                            delivery_summary = ?,
                            is_primary = ?,
                            updated_at = ?
                        WHERE id = ?
                    `,
                )
                .run(
                    nextEnvironmentLabel,
                    worldTruth.sourceKind,
                    worldTruth.sourceLabel,
                    worldTruth.laneKind,
                    worldTruth.laneLabel,
                    worldTruth.deliveryPosture,
                    worldTruth.deliveryLabel,
                    worldTruth.deliverySummary,
                    shouldBePrimary ? 1 : existingLink.is_primary,
                    timestamp,
                    existingLink.id,
                );
        } else {
            database()
                .prepare(
                    `
                        INSERT INTO project_world_links (
                            id,
                            project_id,
                            scene_id,
                            environment_label,
                            source_kind,
                            source_label,
                            lane_kind,
                            lane_label,
                            delivery_posture,
                            delivery_label,
                            delivery_summary,
                            is_primary,
                            created_at,
                            updated_at,
                            last_reopened_at,
                            reopen_count
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
                    `,
                )
                .run(
                    randomUUID(),
                    input.projectId,
                    normalizedSceneId,
                    cleanText(input.environmentLabel),
                    worldTruth.sourceKind,
                    worldTruth.sourceLabel,
                    worldTruth.laneKind,
                    worldTruth.laneLabel,
                    worldTruth.deliveryPosture,
                    worldTruth.deliveryLabel,
                    worldTruth.deliverySummary,
                    shouldBePrimary ? 1 : 0,
                    timestamp,
                    timestamp,
                );
        }

        touchProject(input.projectId, timestamp);
        appendProjectActivity({
            projectId: input.projectId,
            actorEmail: input.ownerEmail,
            eventType: existingLink ? "project.world_link_refreshed" : "project.world_linked",
            summary: existingLink
                ? `Refreshed world truth for ${normalizedSceneId} as ${worldTruth.sourceLabel}, ${worldTruth.laneLabel}, ${worldTruth.deliveryLabel}.`
                : `Linked MVP scene ${normalizedSceneId} with ${worldTruth.sourceLabel}, ${worldTruth.laneLabel}, ${worldTruth.deliveryLabel}.`,
            metadata: {
                sceneId: normalizedSceneId,
                projectId: input.projectId,
                primary: shouldBePrimary,
                sourceKind: worldTruth.sourceKind,
                laneKind: worldTruth.laneKind,
                deliveryPosture: worldTruth.deliveryPosture,
            },
            createdAt: timestamp,
        });
    });

    transaction();

    const nextDetail = getProjectDetailForOwner(input.ownerEmail, input.projectId);
    if (!nextDetail) {
        throw new Error("World link was recorded but the project could not be reloaded.");
    }

    return nextDetail;
}

export function recordProjectWorldOpenedForOwner(input: RecordWorldOpenInput) {
    const detail = getProjectDetailForOwner(input.ownerEmail, input.projectId);
    if (!detail) {
        throw new Error("Project not found or access denied.");
    }

    const normalizedSceneId = normalizeSceneId(input.sceneId);
    if (!normalizedSceneId) {
        throw new Error("sceneId is required to record a project reopen.");
    }

    const matchingLink = getWorldLinkRowForProject(input.projectId, normalizedSceneId);
    if (!matchingLink) {
        throw new Error("Project-linked reopen requires a scene that is already owned by this project.");
    }

    const timestamp = nowIso();
    const transaction = database().transaction(() => {
        database()
            .prepare(
                `
                    UPDATE project_world_links
                    SET
                        last_reopened_at = ?,
                        reopen_count = reopen_count + 1,
                        updated_at = ?
                    WHERE id = ?
                `,
            )
            .run(timestamp, timestamp, matchingLink.id);

        touchProject(input.projectId, timestamp, timestamp);
        appendProjectActivity({
            projectId: input.projectId,
            actorEmail: input.ownerEmail,
            eventType: "project.world_reopened",
            summary: `Reopened linked scene ${normalizedSceneId}${cleanText(input.versionId) ? ` at ${cleanText(input.versionId)}` : ""} through the project layer.`,
            metadata: {
                sceneId: normalizedSceneId,
                versionId: cleanText(input.versionId),
                openedFrom: cleanText(input.openedFrom),
            },
            createdAt: timestamp,
        });
    });

    transaction();

    const nextDetail = getProjectDetailForOwner(input.ownerEmail, input.projectId);
    if (!nextDetail) {
        throw new Error("Project reopen was recorded but the project could not be reloaded.");
    }

    return nextDetail;
}

export function getOwnedWorldLinkForProject(ownerEmail: string, projectId: string, sceneId: string) {
    const detail = getProjectDetailForOwner(ownerEmail, projectId);
    if (!detail) {
        return null;
    }

    return detail.worldLinks.find((entry) => entry.sceneId === normalizeSceneId(sceneId)) ?? null;
}
