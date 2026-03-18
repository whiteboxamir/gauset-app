import type { AuthSession } from "@/server/contracts/auth";
import type { WorldTruthSummary } from "@/server/contracts/world-truth";
import type { ProjectActivityEvent, ProjectCard, ProjectDetail, ProjectWorldLink } from "@/server/contracts/projects";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restDelete, restInsert, restRpc, restSelect, restUpdate } from "@/server/db/rest";
import { canSessionAccessMvp } from "@/server/mvp/access";
import { buildUpstreamRequestHeaders, buildUpstreamUrl, resolveBackendBaseUrlForOrigin, resolveBackendWorkerToken } from "@/server/mvp/proxyBackend";
import { deriveWorldTruthSummary, flattenWorldTruthSummary } from "@/server/world-truth";

interface ProjectRow {
    id: string;
    studio_id: string | null;
    owner_user_id: string;
    name: string;
    slug: string;
    description: string | null;
    status: "draft" | "active" | "archived";
    cover_image_url: string | null;
    last_activity_at: string | null;
    last_world_opened_at: string | null;
}

interface ProjectMembershipRow {
    project_id: string;
    role: "owner" | "editor" | "reviewer" | "finance" | "viewer";
}

interface ProjectWorldLinkRow {
    id: string;
    project_id: string;
    scene_id: string;
    environment_label: string | null;
    is_primary: boolean;
    ownership_status: "active" | "released" | "superseded";
    ownership_claimed_at: string;
    created_at: string;
}

interface ClaimProjectWorldLinkRow {
    link_id: string | null;
    project_id: string | null;
    scene_id: string | null;
    ownership_status: "active" | "released" | "superseded" | null;
    conflicting_project_id: string | null;
    created: boolean;
}

interface SceneVersionListResponse {
    versions?: Array<{
        version_id?: string;
    }>;
}

interface SceneVersionPayload {
    scene_document?: unknown;
    scene_graph?: unknown;
    sceneGraph?: unknown;
}

interface ProjectActivityEventRow {
    id: string;
    project_id: string;
    actor_user_id: string | null;
    actor_type: "user" | "system" | "admin";
    event_type: string;
    summary: string;
    created_at: string;
}

interface StudioRow {
    id: string;
    name: string;
}

function createEmptyProjectDetail(): ProjectDetail {
    return {
        project: {
            projectId: "",
            studioId: null,
            studioName: null,
            ownerUserId: "",
            name: "",
            slug: "",
            description: null,
            status: "draft",
            coverImageUrl: null,
            lastActivityAt: null,
            lastWorldOpenedAt: null,
            membershipRole: "viewer",
            worldCount: 0,
            primarySceneId: null,
            primaryEnvironmentLabel: null,
        },
        worldLinks: [],
        activity: [],
    };
}

function resolveServerAppOrigin(env: NodeJS.ProcessEnv = process.env) {
    const explicitHost =
        env.NEXT_PUBLIC_GAUSET_APP_HOST?.trim() ||
        env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
        env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
        env.VERCEL_URL?.trim() ||
        "";
    if (explicitHost) {
        return explicitHost.startsWith("http://") || explicitHost.startsWith("https://") ? explicitHost : `https://${explicitHost}`;
    }

    const port = env.PORT?.trim() || "3000";
    return `http://127.0.0.1:${port}`;
}

async function fetchJsonFromMvpBackend<T>({
    pathname,
    session,
}: {
    pathname: string;
    session: AuthSession;
}) {
    const backendBaseUrl = resolveBackendBaseUrlForOrigin({
        origin: resolveServerAppOrigin(),
    });
    if (!backendBaseUrl) {
        return null as T | null;
    }

    const response = await fetch(
        buildUpstreamUrl({
            backendBaseUrl,
            pathname,
            searchParams: new URLSearchParams(),
        }),
        {
            headers: buildUpstreamRequestHeaders({
                requestHeaders: new Headers(),
                workerToken: resolveBackendWorkerToken(),
                studioId: session.activeStudioId ?? null,
                userId: session.user.userId,
            }),
            cache: "no-store",
        },
    );
    if (!response.ok) {
        return null as T | null;
    }

    return (await response.json()) as T;
}

async function resolveWorldLinkTruthSummary({
    session,
    sceneId,
    fallbackLabel,
}: {
    session: AuthSession;
    sceneId: string;
    fallbackLabel?: string | null;
}): Promise<WorldTruthSummary | null> {
    const normalizedSceneId = sceneId.trim();
    if (!normalizedSceneId) {
        return null;
    }

    try {
        const versionsPayload = await fetchJsonFromMvpBackend<SceneVersionListResponse>({
            pathname: `scene/${encodeURIComponent(normalizedSceneId)}/versions`,
            session,
        });
        const latestVersionId =
            versionsPayload?.versions?.find((entry) => typeof entry?.version_id === "string" && entry.version_id.trim())?.version_id?.trim() ?? null;
        if (!latestVersionId) {
            return null;
        }

        const versionPayload = await fetchJsonFromMvpBackend<SceneVersionPayload>({
            pathname: `scene/${encodeURIComponent(normalizedSceneId)}/versions/${encodeURIComponent(latestVersionId)}`,
            session,
        });
        if (!versionPayload) {
            return null;
        }

        return deriveWorldTruthSummary({
            sceneId: normalizedSceneId,
            versionId: latestVersionId,
            sceneDocument:
                versionPayload.scene_document ??
                ((versionPayload.scene_graph as { __scene_document_v2?: unknown } | undefined)?.__scene_document_v2 ?? null) ??
                ((versionPayload.sceneGraph as { __scene_document_v2?: unknown } | undefined)?.__scene_document_v2 ?? null),
            sceneGraph: versionPayload.scene_graph ?? versionPayload.sceneGraph ?? null,
            fallbackLabel,
        });
    } catch {
        return null;
    }
}

function slugifyProjectName(value: string) {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);
}

async function resolveStudioNames(studioIds: string[]) {
    if (studioIds.length === 0) return [] as StudioRow[];
    return restSelect<StudioRow[]>("studios", {
        select: "id,name",
        filters: {
            id: `in.(${studioIds.join(",")})`,
        },
    });
}

async function resolveMembershipsForProjects(userId: string, projectIds: string[]) {
    if (projectIds.length === 0) return [] as ProjectMembershipRow[];
    return restSelect<ProjectMembershipRow[]>("project_memberships", {
        select: "project_id,role",
        filters: {
            user_id: `eq.${userId}`,
            project_id: `in.(${projectIds.join(",")})`,
        },
    });
}

async function resolveWorldLinksForProjects(projectIds: string[]) {
    if (projectIds.length === 0) return [] as ProjectWorldLinkRow[];
    return restSelect<ProjectWorldLinkRow[]>("project_world_links", {
        select: "id,project_id,scene_id,environment_label,is_primary,ownership_status,ownership_claimed_at,created_at",
        filters: {
            project_id: `in.(${projectIds.join(",")})`,
            ownership_status: "eq.active",
            order: "created_at.desc",
        },
    });
}

async function assertSceneLinkAvailableForSession({
    session,
    sceneId,
    targetProjectId,
}: {
    session: AuthSession;
    sceneId: string;
    targetProjectId?: string;
}) {
    const normalizedSceneId = sceneId.trim();
    if (!normalizedSceneId || !isPlatformDatabaseConfigured()) {
        return;
    }

    const links = await restSelect<Array<Pick<ProjectWorldLinkRow, "project_id" | "scene_id">>>("project_world_links", {
        select: "project_id,scene_id",
        filters: {
            scene_id: `eq.${normalizedSceneId}`,
            ownership_status: "eq.active",
            limit: "50",
        },
    });
    const linkedProjectIds = Array.from(new Set(links.map((link) => link.project_id)));
    if (linkedProjectIds.length === 0) {
        return;
    }

    if (targetProjectId && linkedProjectIds.includes(targetProjectId)) {
        throw new Error("Scene is already linked to this project.");
    }

    const [projects, memberships] = await Promise.all([
        restSelect<Array<Pick<ProjectRow, "id" | "owner_user_id">>>("projects", {
            select: "id,owner_user_id",
            filters: {
                id: `in.(${linkedProjectIds.join(",")})`,
            },
        }),
        restSelect<Array<Pick<ProjectMembershipRow, "project_id">>>("project_memberships", {
            select: "project_id",
            filters: {
                user_id: `eq.${session.user.userId}`,
                project_id: `in.(${linkedProjectIds.join(",")})`,
            },
        }),
    ]);

    const accessibleProjectId =
        linkedProjectIds.find((projectId) => memberships.some((membership) => membership.project_id === projectId)) ??
        linkedProjectIds.find((projectId) => projects.find((project) => project.id === projectId)?.owner_user_id === session.user.userId) ??
        null;

    if (accessibleProjectId) {
        throw new Error("Scene is already linked to another project you can access. Open that project instead.");
    }

    throw new Error("Scene is linked to another account.");
}

async function claimProjectWorldLink({
    projectId,
    sceneId,
    environmentLabel,
    makePrimary,
    createdByUserId,
}: {
    projectId: string;
    sceneId: string;
    environmentLabel?: string | null;
    makePrimary?: boolean;
    createdByUserId?: string | null;
}) {
    const rows = await restRpc<ClaimProjectWorldLinkRow[]>("claim_project_world_link", {
        p_project_id: projectId,
        p_scene_id: sceneId.trim(),
        p_environment_label: environmentLabel?.trim() || null,
        p_make_primary: Boolean(makePrimary),
        p_created_by_user_id: createdByUserId ?? null,
    });

    const result = Array.isArray(rows) ? rows[0] ?? null : null;
    if (!result || !result.scene_id) {
        throw new Error("Project world-link ownership could not be claimed.");
    }

    return result;
}

function mapProjectCard({
    project,
    membershipRole,
    studioName,
    worldLinks,
}: {
    project: ProjectRow;
    membershipRole: ProjectCard["membershipRole"];
    studioName: string | null;
    worldLinks: ProjectWorldLinkRow[];
}): ProjectCard {
    const primary = worldLinks.find((entry) => entry.is_primary) ?? worldLinks[0] ?? null;

    return {
        projectId: project.id,
        studioId: project.studio_id,
        studioName,
        ownerUserId: project.owner_user_id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        status: project.status,
        coverImageUrl: project.cover_image_url,
        lastActivityAt: project.last_activity_at,
        lastWorldOpenedAt: project.last_world_opened_at,
        membershipRole,
        worldCount: worldLinks.length,
        primarySceneId: primary?.scene_id ?? null,
        primaryEnvironmentLabel: primary?.environment_label ?? null,
    };
}

async function logProjectEvent({
    projectId,
    actorUserId,
    actorType,
    eventType,
    summary,
    metadata,
}: {
    projectId: string;
    actorUserId: string | null;
    actorType: "user" | "system" | "admin";
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown>;
}) {
    await restInsert("project_activity_events", {
        project_id: projectId,
        actor_user_id: actorUserId,
        actor_type: actorType,
        event_type: eventType,
        summary,
        metadata: metadata ?? {},
    });
}

async function touchProjectActivity(projectId: string) {
    await restUpdate(
        "projects",
        {
            last_activity_at: new Date().toISOString(),
        },
        {
            id: `eq.${projectId}`,
        },
    );
}

export async function listProjectsForSession(session: AuthSession): Promise<ProjectCard[]> {
    if (!isPlatformDatabaseConfigured()) {
        return [];
    }

    const activeStudioId = session.activeStudioId;
    const projectRows = await restSelect<ProjectRow[]>("projects", {
        select: "id,studio_id,owner_user_id,name,slug,description,status,cover_image_url,last_activity_at,last_world_opened_at",
        filters: activeStudioId
            ? {
                  studio_id: `eq.${activeStudioId}`,
                  order: "last_activity_at.desc.nullslast",
              }
            : {
                  owner_user_id: `eq.${session.user.userId}`,
                  order: "last_activity_at.desc.nullslast",
              },
    });

    const projectIds = projectRows.map((project) => project.id);
    const studioIds = Array.from(new Set(projectRows.map((project) => project.studio_id).filter(Boolean) as string[]));
    const [memberships, worldLinks, studios] = await Promise.all([
        resolveMembershipsForProjects(session.user.userId, projectIds),
        resolveWorldLinksForProjects(projectIds),
        resolveStudioNames(studioIds),
    ]);

    const accessibleProjects = projectRows.filter(
        (project) => project.owner_user_id === session.user.userId || memberships.some((entry) => entry.project_id === project.id),
    );

    return accessibleProjects.map((project) =>
        mapProjectCard({
            project,
            membershipRole: memberships.find((entry) => entry.project_id === project.id)?.role ?? "viewer",
            studioName: studios.find((studio) => studio.id === project.studio_id)?.name ?? null,
            worldLinks: worldLinks.filter((entry) => entry.project_id === project.id),
        }),
    );
}

export async function createProjectForSession({
    session,
    name,
    description,
    sceneId,
    environmentLabel,
}: {
    session: AuthSession;
    name: string;
    description?: string | null;
    sceneId?: string | null;
    environmentLabel?: string | null;
}) {
    if (!isPlatformDatabaseConfigured()) {
        throw new Error("Platform database is not configured.");
    }

    const projectName = name.trim();
    if (!projectName) {
        throw new Error("Project name is required.");
    }

    const activeStudioId = session.activeStudioId;
    const slugBase = slugifyProjectName(projectName) || "project";
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
    const initialSceneId = sceneId?.trim() || null;

    if (initialSceneId) {
        await assertSceneLinkAvailableForSession({
            session,
            sceneId: initialSceneId,
        });
    }

    const insertedProjects = await restInsert<Array<{ id: string }>>("projects", {
        studio_id: activeStudioId,
        owner_user_id: session.user.userId,
        name: projectName,
        slug,
        description: description?.trim() || null,
        status: "draft",
        last_activity_at: new Date().toISOString(),
        created_by_user_id: session.user.userId,
    });

    const projectId = insertedProjects[0]?.id;
    if (!projectId) {
        throw new Error("Unable to create project.");
    }

    try {
        await restInsert("project_memberships", {
            project_id: projectId,
            user_id: session.user.userId,
            role: "owner",
        });

        if (initialSceneId) {
            const claim = await claimProjectWorldLink({
                projectId,
                sceneId: initialSceneId,
                environmentLabel,
                makePrimary: true,
                createdByUserId: session.user.userId,
            });
            if (claim.conflicting_project_id && claim.conflicting_project_id !== projectId) {
                await assertSceneLinkAvailableForSession({
                    session,
                    sceneId: initialSceneId,
                });
                throw new Error("Scene ownership could not be claimed.");
            }
        }
    } catch (error) {
        await restDelete("projects", {
            id: `eq.${projectId}`,
        }).catch(() => null);
        throw error;
    }

    await logProjectEvent({
        projectId,
        actorUserId: session.user.userId,
        actorType: "user",
        eventType: "project.created",
        summary: `Created project ${projectName}.`,
        metadata: initialSceneId ? { sceneId: initialSceneId } : {},
    });

    return projectId;
}

export async function getProjectDetailForSession(session: AuthSession, projectId: string): Promise<ProjectDetail | null> {
    if (!isPlatformDatabaseConfigured()) {
        return null;
    }

    const [projects, memberships, worldLinks, activity] = await Promise.all([
        restSelect<ProjectRow[]>("projects", {
            select: "id,studio_id,owner_user_id,name,slug,description,status,cover_image_url,last_activity_at,last_world_opened_at",
            filters: {
                id: `eq.${projectId}`,
                limit: "1",
            },
        }),
        resolveMembershipsForProjects(session.user.userId, [projectId]),
        resolveWorldLinksForProjects([projectId]),
        restSelect<ProjectActivityEventRow[]>("project_activity_events", {
            select: "id,project_id,actor_user_id,actor_type,event_type,summary,created_at",
            filters: {
                project_id: `eq.${projectId}`,
                order: "created_at.desc",
                limit: "20",
            },
        }),
    ]);

    const project = projects[0];
    if (!project) {
        return null;
    }

    const membership = memberships.find((entry) => entry.project_id === projectId);
    if (!membership && project.owner_user_id !== session.user.userId) {
        return null;
    }

    const canInspectSavedTruth = await canSessionAccessMvp(session);
    const [studioRows, worldLinkTruth] = await Promise.all([
        resolveStudioNames(project.studio_id ? [project.studio_id] : []),
        canInspectSavedTruth
            ? Promise.all(
                  worldLinks.map(async (entry) => [
                      entry.id,
                      await resolveWorldLinkTruthSummary({
                          session,
                          sceneId: entry.scene_id,
                          fallbackLabel: entry.environment_label,
                      }),
                  ] as const),
              )
            : Promise.resolve([] as Array<readonly [string, WorldTruthSummary | null]>),
    ]);
    const truthByWorldLinkId = new Map(worldLinkTruth);

    return {
        project: mapProjectCard({
            project,
            membershipRole: membership?.role ?? "owner",
            studioName: studioRows[0]?.name ?? null,
            worldLinks,
        }),
        worldLinks: worldLinks.map((entry): ProjectWorldLink => {
            const truthSummary = truthByWorldLinkId.get(entry.id) ?? null;
            return {
                id: entry.id,
                projectId: entry.project_id,
                sceneId: entry.scene_id,
                environmentLabel: entry.environment_label,
                isPrimary: entry.is_primary,
                ownershipStatus: entry.ownership_status,
                ownershipClaimedAt: entry.ownership_claimed_at,
                createdAt: entry.created_at,
                truthSummary,
                ...flattenWorldTruthSummary(truthSummary),
            };
        }),
        activity: activity.map((entry): ProjectActivityEvent => ({
            id: entry.id,
            projectId: entry.project_id,
            actorUserId: entry.actor_user_id,
            actorType: entry.actor_type,
            eventType: entry.event_type,
            summary: entry.summary,
            createdAt: entry.created_at,
        })),
    };
}

export async function addWorldLinkToProjectForSession({
    session,
    projectId,
    sceneId,
    environmentLabel,
    makePrimary,
}: {
    session: AuthSession;
    projectId: string;
    sceneId: string;
    environmentLabel?: string | null;
    makePrimary?: boolean;
}) {
    const detail = await getProjectDetailForSession(session, projectId);
    if (!detail) {
        throw new Error("Project not found or access denied.");
    }
    if (!["owner", "editor"].includes(detail.project.membershipRole)) {
        throw new Error("World linking requires owner or editor access.");
    }

    await assertSceneLinkAvailableForSession({
        session,
        sceneId,
        targetProjectId: projectId,
    });

    const normalizedSceneId = sceneId.trim();
    const claim = await claimProjectWorldLink({
        projectId,
        sceneId: normalizedSceneId,
        environmentLabel,
        makePrimary,
        createdByUserId: session.user.userId,
    });
    if (claim.conflicting_project_id && claim.conflicting_project_id !== projectId) {
        await assertSceneLinkAvailableForSession({
            session,
            sceneId: normalizedSceneId,
            targetProjectId: projectId,
        });
        throw new Error("Scene ownership could not be claimed.");
    }

    await touchProjectActivity(projectId);
    await logProjectEvent({
        projectId,
        actorUserId: session.user.userId,
        actorType: "user",
        eventType: "project.world_linked",
        summary: `Linked scene ${normalizedSceneId} to project.`,
        metadata: {
            sceneId: normalizedSceneId,
            primary: Boolean(makePrimary),
        },
    });
}

export async function markProjectWorldOpened({
    session,
    projectId,
    sceneId,
}: {
    session: AuthSession;
    projectId: string;
    sceneId: string;
}) {
    const detail = await getProjectDetailForSession(session, projectId);
    if (!detail) {
        throw new Error("Project not found or access denied.");
    }

    const normalizedSceneId = sceneId.trim();
    if (!normalizedSceneId) {
        throw new Error("sceneId is required to record a project reopen.");
    }

    if (!detail.worldLinks.some((entry) => entry.sceneId === normalizedSceneId)) {
        throw new Error("Project reopen tracking requires a scene already linked to this project.");
    }

    const now = new Date().toISOString();
    await restUpdate(
        "projects",
        {
            last_world_opened_at: now,
            last_activity_at: now,
        },
        {
            id: `eq.${projectId}`,
        },
    );

    await logProjectEvent({
        projectId,
        actorUserId: session.user.userId,
        actorType: "user",
        eventType: "project.world_opened",
        summary: `Reopened linked scene ${normalizedSceneId} from the platform control layer.`,
        metadata: {
            sceneId: normalizedSceneId,
        },
    });
}

export async function recordProjectReviewShareForSession({
    session,
    projectId,
    shareId,
    sceneId,
    versionId,
    expiresAt,
    label,
    enforceRole = true,
}: {
    session: AuthSession;
    projectId: string;
    shareId?: string | null;
    sceneId: string;
    versionId: string | null;
    expiresAt: string;
    label?: string | null;
    enforceRole?: boolean;
}) {
    const detail = await getProjectDetailForSession(session, projectId);
    if (!detail) {
        throw new Error("Project not found or access denied.");
    }

    const membershipRole = detail.project.membershipRole;
    if (enforceRole && !["owner", "editor", "reviewer"].includes(membershipRole)) {
        throw new Error("Project review sharing requires owner, editor, or reviewer access.");
    }

    await touchProjectActivity(projectId);
    await logProjectEvent({
        projectId,
        actorUserId: session.user.userId,
        actorType: "user",
        eventType: "project.review_shared",
        summary: `Created secure review share${label?.trim() ? ` "${label.trim()}"` : ""} for ${sceneId}${versionId ? ` (${versionId})` : ""}.`,
        metadata: {
            shareId: shareId ?? null,
            sceneId,
            versionId,
            expiresAt,
        },
    });
}

export async function recordProjectReviewShareRevocationForSession({
    session,
    projectId,
    shareId,
    sceneId,
    versionId,
    label,
}: {
    session: AuthSession;
    projectId: string;
    shareId: string;
    sceneId?: string | null;
    versionId?: string | null;
    label?: string | null;
}) {
    const detail = await getProjectDetailForSession(session, projectId);
    if (!detail) {
        throw new Error("Project not found or access denied.");
    }

    const membershipRole = detail.project.membershipRole;
    if (!["owner", "editor", "reviewer"].includes(membershipRole)) {
        throw new Error("Project review share revocation requires owner, editor, or reviewer access.");
    }

    await touchProjectActivity(projectId);
    await logProjectEvent({
        projectId,
        actorUserId: session.user.userId,
        actorType: "user",
        eventType: "project.review_share_revoked",
        summary: `Revoked secure review share${label?.trim() ? ` "${label.trim()}"` : ""}${sceneId ? ` for ${sceneId}` : ""}${versionId ? ` (${versionId})` : ""}.`,
        metadata: {
            shareId,
            sceneId: sceneId ?? null,
            versionId: versionId ?? null,
        },
    });
}

export async function updateProjectForSession({
    session,
    projectId,
    name,
    description,
    status,
}: {
    session: AuthSession;
    projectId: string;
    name?: string;
    description?: string | null;
    status?: "draft" | "active" | "archived";
}) {
    const detail = await getProjectDetailForSession(session, projectId);
    if (!detail) {
        throw new Error("Project not found or access denied.");
    }

    const membershipRole = detail.project.membershipRole;
    if (!["owner", "editor"].includes(membershipRole)) {
        throw new Error("Project update requires owner or editor access.");
    }

    const patch: Record<string, unknown> = {
        last_activity_at: new Date().toISOString(),
    };
    if (typeof name === "string" && name.trim()) {
        patch.name = name.trim();
    }
    if (description !== undefined) {
        patch.description = description?.trim() || null;
    }
    if (status) {
        patch.status = status;
    }

    await restUpdate(
        "projects",
        patch,
        {
            id: `eq.${projectId}`,
        },
    );

    await logProjectEvent({
        projectId,
        actorUserId: session.user.userId,
        actorType: "user",
        eventType: "project.updated",
        summary: "Updated project metadata.",
        metadata: {
            name: patch.name ?? null,
            status: patch.status ?? null,
        },
    });
}

export async function getDashboardSnapshotForSession(session: AuthSession) {
    const projects = await listProjectsForSession(session);
    const recentProjects = projects.slice(0, 6);
    const activeProjectIds = recentProjects.map((project) => project.projectId);
    const activity =
        activeProjectIds.length > 0 && isPlatformDatabaseConfigured()
            ? await restSelect<ProjectActivityEventRow[]>("project_activity_events", {
                  select: "id,project_id,actor_user_id,actor_type,event_type,summary,created_at",
                  filters: {
                      project_id: `in.(${activeProjectIds.join(",")})`,
                      order: "created_at.desc",
                      limit: "12",
                  },
              })
            : [];

    return {
        projectCount: projects.length,
        activeProjectCount: projects.filter((project) => project.status !== "archived").length,
        worldLinkedCount: projects.reduce((sum, project) => sum + project.worldCount, 0),
        recentProjects,
        recentActivity: activity.map((entry): ProjectActivityEvent => ({
            id: entry.id,
            projectId: entry.project_id,
            actorUserId: entry.actor_user_id,
            actorType: entry.actor_type,
            eventType: entry.event_type,
            summary: entry.summary,
            createdAt: entry.created_at,
        })),
    };
}
