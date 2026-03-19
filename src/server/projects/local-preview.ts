import type { ProjectOperationalRisk } from "@/server/contracts/operations";
import type { ProjectReadinessCard, ProjectReadinessDetail } from "@/server/contracts/projects";
import type { ReleaseReadinessSnapshot } from "@/server/contracts/release-readiness";

const GENERATED_AT = "2026-03-18T15:00:00.000Z";

function createPreviewReadinessSnapshot({
    scope,
    scopeId,
    scopeLabel,
    gateTitle,
    gateSummary,
}: {
    scope: "workspace" | "project";
    scopeId: string | null;
    scopeLabel: string;
    gateTitle: string;
    gateSummary: string;
}): ReleaseReadinessSnapshot {
    return {
        scope,
        scopeId,
        scopeLabel,
        state: "at_risk",
        summary: "Local preview mode keeps the focused world workflow inspectable, while auth-backed collaboration remains unavailable in this shell.",
        generatedAt: GENERATED_AT,
        readyGateCount: 2,
        atRiskGateCount: 1,
        blockedGateCount: 0,
        capabilities: [
            {
                capability: "ship",
                state: "ready",
                summary: "The focused world-start and save-first workflow is inspectable locally.",
            },
            {
                capability: "share",
                state: "at_risk",
                summary: "Review-share and project collaboration need auth-backed services before they can go live.",
            },
            {
                capability: "review",
                state: "ready",
                summary: "Saved-world review posture and staged density can be inspected in the local workspace.",
            },
            {
                capability: "operate",
                state: "at_risk",
                summary: "Project mutations and collaboration remain disabled until auth env is restored.",
            },
        ],
        gates: [
            {
                gateKey: `${scope}-workflow-focus`,
                domain: "projects",
                state: "ready",
                title: "Focused world workflow",
                summary: "World-start, save-first, and reopen sequencing are available for inspection.",
                detail: "The local shell can open the world-start flow and the saved-world workspace without crossing into the old multi-product path.",
                href: scope === "workspace" ? "/app/worlds" : `/app/worlds/${scopeId}`,
                routeLabel: "World flow",
                ownerLabel: "Product",
                signalKey: null,
            },
            {
                gateKey: `${scope}-saved-world-truth`,
                domain: "projects",
                state: "ready",
                title: "Saved-world truth",
                summary: "Review and handoff surfaces now wait for a durable saved version.",
                detail: "Unsaved worlds stay in draft posture, and saved worlds unlock the richer review/handoff state.",
                href: "/mvp/preview",
                routeLabel: "Workspace",
                ownerLabel: "Product",
                signalKey: null,
            },
            {
                gateKey: `${scope}-auth-preview-gap`,
                domain: "workspace",
                state: "at_risk",
                title: gateTitle,
                summary: gateSummary,
                detail: "This local preview keeps the product inspectable without pretending that auth-backed collaboration is operational.",
                href: "/mvp/preview",
                routeLabel: "Preview",
                ownerLabel: "Platform",
                signalKey: null,
            },
        ],
    };
}

const previewProjects: ProjectReadinessCard[] = [
    {
        projectId: "11111111-1111-4111-8111-111111111111",
        studioId: null,
        studioName: "Local Preview",
        ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Backlot Scout",
        slug: "backlot-scout",
        description: "Sample scout-to-shot project for building the first world and saving it once.",
        status: "active",
        coverImageUrl: null,
        lastActivityAt: GENERATED_AT,
        lastWorldOpenedAt: null,
        membershipRole: "owner",
        worldCount: 0,
        primarySceneId: null,
        primaryEnvironmentLabel: null,
        releaseReadiness: createPreviewReadinessSnapshot({
            scope: "project",
            scopeId: "11111111-1111-4111-8111-111111111111",
            scopeLabel: "Backlot Scout",
            gateTitle: "Auth-backed collaboration",
            gateSummary: "Local preview keeps project launch inspectable, but review-share and world-link mutations stay disabled without auth env.",
        }),
    },
    {
        projectId: "22222222-2222-4222-8222-222222222222",
        studioId: null,
        studioName: "Local Preview",
        ownerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Warehouse Blocking",
        slug: "warehouse-blocking",
        description: "Sample blocking project for testing the same world-first flow on a second record.",
        status: "active",
        coverImageUrl: null,
        lastActivityAt: GENERATED_AT,
        lastWorldOpenedAt: null,
        membershipRole: "owner",
        worldCount: 0,
        primarySceneId: null,
        primaryEnvironmentLabel: null,
        releaseReadiness: createPreviewReadinessSnapshot({
            scope: "project",
            scopeId: "22222222-2222-4222-8222-222222222222",
            scopeLabel: "Warehouse Blocking",
            gateTitle: "Auth-backed collaboration",
            gateSummary: "The project shell is inspectable locally, but persistent review-share and ownership APIs remain disabled in preview mode.",
        }),
    },
];

const previewProjectRisks: ProjectOperationalRisk[] = [
    {
        projectId: "11111111-1111-4111-8111-111111111111",
        name: "Backlot Scout",
        slug: "backlot-scout",
        status: "active",
        href: "/app/worlds/11111111-1111-4111-8111-111111111111",
        riskLevel: "watch",
        reasons: ["Auth-backed collaboration remains disabled in this local preview shell."],
        lastActivityAt: GENERATED_AT,
        lastActivityLabel: "Preview mode active",
        hasWorldLink: false,
        activeReviewShareCount: 0,
        totalReviewShareCount: 0,
    },
    {
        projectId: "22222222-2222-4222-8222-222222222222",
        name: "Warehouse Blocking",
        slug: "warehouse-blocking",
        status: "active",
        href: "/app/worlds/22222222-2222-4222-8222-222222222222",
        riskLevel: "stable",
        reasons: [],
        lastActivityAt: GENERATED_AT,
        lastActivityLabel: "Preview mode active",
        hasWorldLink: false,
        activeReviewShareCount: 0,
        totalReviewShareCount: 0,
    },
];

const previewWorkspaceReadiness = createPreviewReadinessSnapshot({
    scope: "workspace",
    scopeId: null,
    scopeLabel: "World workflow local preview",
    gateTitle: "Auth-backed entry",
    gateSummary: "You can inspect the focused project/world flow here, but login-backed collaboration is unavailable in this shell.",
});

export function getLocalPreviewWorkspaceReadiness() {
    return previewWorkspaceReadiness;
}

export function listLocalPreviewProjectReadinessCardsForSession() {
    return previewProjects;
}

export function listLocalPreviewProjectRisks() {
    return previewProjectRisks;
}

export function getLocalPreviewProjectRiskForId(projectId: string) {
    return previewProjectRisks.find((entry) => entry.projectId === projectId) ?? null;
}

export function getLocalPreviewProjectReadinessDetailForId(projectId: string): ProjectReadinessDetail | null {
    const project = previewProjects.find((entry) => entry.projectId === projectId) ?? null;
    if (!project) {
        return null;
    }

    return {
        project,
        worldLinks: [],
        activity: [],
        releaseReadiness: project.releaseReadiness,
    };
}
