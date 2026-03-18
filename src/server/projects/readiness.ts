import type { AuthSession } from "@/server/contracts/auth";
import type { BillingOverview } from "@/server/contracts/billing";
import type { ContinuitySnapshot } from "@/server/contracts/continuity";
import type { CoordinationSnapshot } from "@/server/contracts/coordination";
import type { GovernanceSnapshot } from "@/server/contracts/governance";
import type { ProjectCard, ProjectReadinessCard, ProjectReadinessDetail } from "@/server/contracts/projects";
import type {
    ReleaseCapability,
    ReleaseCapabilityStatus,
    ReleaseGate,
    ReleaseReadinessSnapshot,
    ReleaseReadinessState,
} from "@/server/contracts/release-readiness";
import type { SupportThreadSummary } from "@/server/contracts/support";
import type { TeamRoster } from "@/server/contracts/team";

import { getStudioWorkspaceStateForSession } from "@/server/account/workspaces";
import { getBillingOverviewForSession } from "@/server/billing/summary";
import { isPlatformDatabaseConfigured } from "@/server/db/client";
import { restSelect } from "@/server/db/rest";
import { getCoordinationSnapshotForSession } from "@/server/platform/coordination";
import { coordinationItemKeys } from "@/server/platform/coordination-keys";
import { getContinuitySnapshotForSession } from "@/server/platform/continuity";
import { deriveReleaseReadinessState } from "@/server/platform/release-readiness-core";
import { getProjectOperationsForSession } from "@/server/projects/operations";
import { listSupportThreadsForSession } from "@/server/support/service";
import { getTeamRosterForSession } from "@/server/team/service";
import { getGovernanceSnapshotForSession } from "@/server/account/governance";

import { getProjectDetailForSession, listProjectsForSession } from "./service";

interface StudioAccountFlagRow {
    flag_value: unknown;
    expires_at: string | null;
    created_at: string;
}

interface StudioFeatureFlagRow {
    enabled: boolean;
    created_at: string;
}

interface StudioAccessPosture {
    allowed: boolean;
    source: "plan" | "feature_flag" | "account_flag";
}

interface ReleaseReadinessContext {
    generatedAt: string;
    workspaceState: Awaited<ReturnType<typeof getStudioWorkspaceStateForSession>>;
    billingOverview: BillingOverview;
    roster: TeamRoster;
    supportThreads: SupportThreadSummary[];
    governanceSnapshot: GovernanceSnapshot;
    continuitySnapshot: ContinuitySnapshot;
    coordinationSnapshot: CoordinationSnapshot;
    projectRisks: Awaited<ReturnType<typeof getProjectOperationsForSession>>;
    projects: ProjectCard[];
    studioAccess: StudioAccessPosture;
}

function isTruthyFlagValue(value: unknown) {
    if (typeof value === "boolean") {
        return value;
    }
    if (typeof value === "string") {
        return value === "true" || value === "1";
    }
    if (typeof value === "number") {
        return value === 1;
    }
    if (typeof value === "object" && value !== null && "enabled" in value) {
        return Boolean((value as { enabled?: unknown }).enabled);
    }
    return false;
}

async function resolveStudioAccessPosture(studioId: string | null, billingOverview: BillingOverview): Promise<StudioAccessPosture> {
    if (!studioId || !isPlatformDatabaseConfigured()) {
        return {
            allowed: billingOverview.summary.entitlements.canAccessMvp,
            source: "plan",
        };
    }

    const now = Date.now();
    const [accountFlags, studioFeatureFlags, globalFeatureFlags] = await Promise.all([
        restSelect<StudioAccountFlagRow[]>("account_flags", {
            select: "flag_value,expires_at,created_at",
            filters: {
                flag_key: "eq.mvp_access",
                studio_id: `eq.${studioId}`,
                user_id: "is.null",
                order: "created_at.desc",
                limit: "10",
            },
        }),
        restSelect<StudioFeatureFlagRow[]>("feature_flags", {
            select: "enabled,created_at",
            filters: {
                flag_key: "eq.mvp_access",
                scope_type: "eq.studio",
                studio_id: `eq.${studioId}`,
                order: "created_at.desc",
                limit: "1",
            },
        }),
        restSelect<StudioFeatureFlagRow[]>("feature_flags", {
            select: "enabled,created_at",
            filters: {
                flag_key: "eq.mvp_access",
                scope_type: "eq.global",
                order: "created_at.desc",
                limit: "1",
            },
        }),
    ]);

    const activeAccountFlag = accountFlags.find((row) => !row.expires_at || Date.parse(row.expires_at) >= now) ?? null;
    if (activeAccountFlag) {
        return {
            allowed: isTruthyFlagValue(activeAccountFlag.flag_value),
            source: "account_flag",
        };
    }

    const featureFlag = studioFeatureFlags[0] ?? globalFeatureFlags[0] ?? null;
    if (featureFlag) {
        return {
            allowed: featureFlag.enabled,
            source: "feature_flag",
        };
    }

    return {
        allowed: billingOverview.summary.entitlements.canAccessMvp,
        source: "plan",
    };
}

function getStateRank(state: ReleaseReadinessState) {
    return {
        blocked: 0,
        at_risk: 1,
        ready: 2,
    }[state];
}

function createGate(input: ReleaseGate): ReleaseGate {
    return input;
}

function summarizeSnapshot(scopeLabel: string, gates: ReleaseGate[]) {
    const blocked = gates.filter((gate) => gate.state === "blocked");
    if (blocked.length > 0) {
        return `${scopeLabel} is blocked by ${blocked
            .slice(0, 2)
            .map((gate) => gate.title.toLowerCase())
            .join(" and ")}.`;
    }

    const atRisk = gates.filter((gate) => gate.state === "at_risk");
    if (atRisk.length > 0) {
        return `${scopeLabel} is at risk because ${atRisk
            .slice(0, 2)
            .map((gate) => gate.title.toLowerCase())
            .join(" and ")} still need attention.`;
    }

    return `${scopeLabel} is ready from current platform truth.`;
}

function summarizeCapability(capability: ReleaseCapability, gates: ReleaseGate[]): ReleaseCapabilityStatus {
    const state = deriveReleaseReadinessState(gates.map((gate) => gate.state));
    const topGate =
        gates
            .slice()
            .sort((left, right) => getStateRank(left.state) - getStateRank(right.state))[0] ?? null;

    if (state === "ready") {
        return {
            capability,
            state,
            summary: `Ready to ${capability} from current platform posture.`,
        };
    }

    return {
        capability,
        state,
        summary: `${state === "blocked" ? "Blocked" : "At risk"} for ${capability} because ${topGate?.title.toLowerCase() ?? "shared platform gates"} need attention.`,
    };
}

function buildSnapshot({
    scope,
    scopeId,
    scopeLabel,
    generatedAt,
    gates,
    capabilities,
}: {
    scope: ReleaseReadinessSnapshot["scope"];
    scopeId: string | null;
    scopeLabel: string;
    generatedAt: string;
    gates: ReleaseGate[];
    capabilities: ReleaseCapabilityStatus[];
}): ReleaseReadinessSnapshot {
    const state = deriveReleaseReadinessState(gates.map((gate) => gate.state));

    return {
        scope,
        scopeId,
        scopeLabel,
        state,
        summary: summarizeSnapshot(scopeLabel, gates),
        generatedAt,
        readyGateCount: gates.filter((gate) => gate.state === "ready").length,
        atRiskGateCount: gates.filter((gate) => gate.state === "at_risk").length,
        blockedGateCount: gates.filter((gate) => gate.state === "blocked").length,
        capabilities,
        gates,
    };
}

function deriveBillingState(billingOverview: BillingOverview) {
    const subscription = billingOverview.summary.subscription;
    const invoice = billingOverview.summary.latestInvoice;

    if (!subscription) {
        return {
            state: "blocked" as const,
            summary: "No active billing plan is attached to this workspace.",
            detail: "Attach or provision a subscription before this workspace can be treated as release-ready.",
        };
    }

    if (["unpaid", "incomplete"].includes(subscription.status)) {
        return {
            state: "blocked" as const,
            summary: `Subscription is ${subscription.status.replaceAll("_", " ")}.`,
            detail: "Billing access is unhealthy enough to block release and operating posture.",
        };
    }

    if (subscription.status === "past_due") {
        return {
            state: "at_risk" as const,
            summary: "Subscription is past due.",
            detail: "Workspace access still exists, but billing posture is drifting and needs correction before release confidence is healthy.",
        };
    }

    if (invoice && ["open", "uncollectible"].includes(invoice.status) && invoice.amountRemainingCents > 0) {
        return {
            state: invoice.status === "uncollectible" ? ("blocked" as const) : ("at_risk" as const),
            summary: "The latest invoice still needs payment attention.",
            detail: "Unresolved invoice balance is still visible in billing, which keeps the workspace below a clean release posture.",
        };
    }

    return {
        state: "ready" as const,
        summary: `${subscription.plan.name} is attached and billing posture is healthy.`,
        detail: "Subscription and invoice state currently support release and ongoing access.",
    };
}

function deriveTeamState(roster: TeamRoster, coordinationSnapshot: CoordinationSnapshot) {
    const activeMembers = roster.members.filter((member) => member.status === "active");
    const pendingInvites = roster.invitations.filter((invitation) => invitation.status === "pending");

    if (activeMembers.length === 0) {
        return {
            state: "blocked" as const,
            summary: "No active studio operators are recorded.",
            detail: "Release readiness cannot be trusted until at least one active operator exists in the roster.",
        };
    }

    if (activeMembers.length === 1 && pendingInvites.length === 0) {
        return {
            state: "at_risk" as const,
            summary: "A single active operator owns the studio posture.",
            detail: "Invite or activate another operator so release, support, and governance are not single-threaded.",
        };
    }

    if (coordinationSnapshot.coverage.summary.undercoveredLaneCount > 0) {
        return {
            state: "at_risk" as const,
            summary: "The roster exists, but at least one lane is still undercovered.",
            detail: "Team coverage is present but not yet aligned to the current workload across the platform lanes.",
        };
    }

    return {
        state: "ready" as const,
        summary: `${activeMembers.length} active operators and ${pendingInvites.length} invitations are on record.`,
        detail: "The studio roster is not currently a release blocker.",
    };
}

function deriveSupportState({
    supportThreads,
    hasSupportPath,
}: {
    supportThreads: SupportThreadSummary[];
    hasSupportPath: boolean;
}) {
    const openThreads = supportThreads.filter((thread) => thread.status === "open" || thread.status === "pending");
    const urgentThreads = openThreads.filter((thread) => thread.priority === "urgent");
    const highThreads = openThreads.filter((thread) => thread.priority === "high");

    if (urgentThreads.length > 0) {
        return {
            state: "blocked" as const,
            summary: "Urgent support work is still open.",
            detail: "An urgent support thread is unresolved, so the workspace is not in a clean operate-ready posture.",
        };
    }

    if (!hasSupportPath) {
        return {
            state: "at_risk" as const,
            summary: "No durable support routing path is configured.",
            detail: "Add studio contact data or open a support thread so operators have an explicit escalation path.",
        };
    }

    if (highThreads.length > 0) {
        return {
            state: "at_risk" as const,
            summary: "High-priority support follow-up is still open.",
            detail: "Support posture is live, but active high-priority threads mean operate readiness still needs attention.",
        };
    }

    return {
        state: "ready" as const,
        summary: "Support routing and active escalation posture are healthy.",
        detail: "No urgent or high-priority support work is currently blocking release readiness.",
    };
}

function deriveGovernanceState(governanceSnapshot: GovernanceSnapshot) {
    const topItem = governanceSnapshot.items[0] ?? null;

    if (governanceSnapshot.overallStatus === "blocked" || governanceSnapshot.items.some((item) => item.severity === "urgent")) {
        return {
            state: "blocked" as const,
            summary: topItem?.title ?? "Governance posture is blocked.",
            detail: topItem?.summary ?? "Approval or access-review posture is blocking release readiness.",
        };
    }

    if (
        governanceSnapshot.overallStatus !== "aligned" ||
        governanceSnapshot.pendingApprovalCount > 0 ||
        governanceSnapshot.accessReview.status !== "completed"
    ) {
        return {
            state: "at_risk" as const,
            summary: topItem?.title ?? "Governance still needs attention.",
            detail:
                topItem?.summary ??
                "Workspace approvals, access review cadence, or policy posture still need attention before release confidence is clean.",
        };
    }

    return {
        state: "ready" as const,
        summary: "Governance posture is aligned.",
        detail: "No approval or access-review issues are currently degrading release readiness.",
    };
}

function deriveCoverageState(coordinationSnapshot: CoordinationSnapshot) {
    const coverage = coordinationSnapshot.coverage;
    const topProjectItem = [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].find((item) => item.domain === "projects") ?? null;

    if (coverage.summary.unownedUrgentItemCount > 0 || coverage.summary.unavailableOwnerItemCount > 0) {
        return {
            state: "blocked" as const,
            summary: topProjectItem?.title ?? "Coverage still has urgent ownership gaps.",
            detail:
                topProjectItem?.summary ??
                "Urgent work is unowned or owned by unavailable operators, which blocks safe release and operating posture.",
        };
    }

    if (coverage.health !== "stable" || coverage.summary.staleInProgressCount > 0) {
        return {
            state: "at_risk" as const,
            summary: topProjectItem?.title ?? "Coverage posture still needs attention.",
            detail:
                topProjectItem?.summary ??
                "Coverage is present but still drifting from workload, so release posture is not fully stable yet.",
        };
    }

    return {
        state: "ready" as const,
        summary: "Coverage posture is aligned to the current workload.",
        detail: "No urgent ownership or lane-coverage gaps are currently degrading release readiness.",
    };
}

function deriveContinuityState(continuitySnapshot: ContinuitySnapshot, domain: "workspace" | "projects") {
    const handoff = domain === "projects" ? continuitySnapshot.handoffs.find((entry) => entry.domain === "projects") ?? null : null;
    const detail = handoff?.reasons[0] ?? continuitySnapshot.reasons[0] ?? "Continuity posture is healthy.";

    if ((domain === "projects" ? handoff?.health === "critical" : continuitySnapshot.health === "critical")) {
        return {
            state: "blocked" as const,
            summary: domain === "projects" ? "Project continuity is critical." : "Workspace continuity is critical.",
            detail,
        };
    }

    if ((domain === "projects" ? handoff?.health && handoff.health !== "stable" : continuitySnapshot.health !== "stable")) {
        return {
            state: "at_risk" as const,
            summary: domain === "projects" ? "Project continuity is drifting." : "Workspace continuity is drifting.",
            detail,
        };
    }

    return {
        state: "ready" as const,
        summary: domain === "projects" ? "Project continuity posture is healthy." : "Workspace continuity posture is healthy.",
        detail,
    };
}

function deriveIdentityState(workspaceState: ReleaseReadinessContext["workspaceState"]) {
    const activeStudio = workspaceState.activeStudio;
    const billingEmail = activeStudio?.billingEmail ?? null;
    const supportEmail = activeStudio?.supportEmail ?? null;

    if (!activeStudio) {
        return {
            state: "blocked" as const,
            summary: "No active workspace is selected.",
            detail: "Release readiness cannot be derived until a real workspace is active.",
        };
    }

    if (!billingEmail && !supportEmail) {
        return {
            state: "blocked" as const,
            summary: "Billing and support contacts are both missing.",
            detail: "Workspace identity is incomplete, so support and billing follow-up have no explicit contact path.",
        };
    }

    if (!billingEmail || !supportEmail) {
        return {
            state: "at_risk" as const,
            summary: "One workspace contact path is still missing.",
            detail: "Complete both billing and support contact fields so the studio identity is fully operational.",
        };
    }

    return {
        state: "ready" as const,
        summary: "Workspace billing and support contacts are configured.",
        detail: "Studio identity is complete enough for release, billing, and support routing.",
    };
}

function deriveAccessState(workspaceState: ReleaseReadinessContext["workspaceState"], studioAccess: StudioAccessPosture) {
    if (!workspaceState.activeStudio) {
        return {
            state: "blocked" as const,
            summary: "No active workspace is mounted.",
            detail: "Create or activate a workspace before release readiness can be trusted.",
        };
    }

    if (!studioAccess.allowed) {
        return {
            state: "blocked" as const,
            summary: "World access is not currently entitled for this studio.",
            detail:
                studioAccess.source === "plan"
                    ? "Plan entitlements do not currently include MVP access."
                    : "Studio access is currently controlled by a platform override and is not enabled.",
        };
    }

    return {
        state: "ready" as const,
        summary:
            studioAccess.source === "plan"
                ? "Studio access is backed by active plan entitlements."
                : "Studio access is explicitly enabled by a platform override.",
        detail: "Access posture is not currently blocking release readiness.",
    };
}

function deriveProjectPostureState({
    project,
    projectRisk,
}: {
    project: ProjectCard;
    projectRisk: ReleaseReadinessContext["projectRisks"][number] | null;
}) {
    if (project.status === "archived") {
        return {
            state: "blocked" as const,
            summary: "Project is archived.",
            detail: "Archived projects are not treated as release-ready surfaces.",
        };
    }

    if (projectRisk?.riskLevel === "urgent") {
        return {
            state: "blocked" as const,
            summary: `${project.name} is carrying urgent project risk.`,
            detail: projectRisk.reasons.join(" · "),
        };
    }

    if (project.status === "draft" || projectRisk?.riskLevel === "watch") {
        return {
            state: "at_risk" as const,
            summary: project.status === "draft" ? "Project is still in draft posture." : `${project.name} still has watch-level project risk.`,
            detail: projectRisk?.reasons.join(" · ") ?? "Project posture still needs attention before it should be treated as ready.",
        };
    }

    return {
        state: "ready" as const,
        summary: "Project posture is stable.",
        detail: "The project is active and is not currently carrying risk-level blockers.",
    };
}

function deriveProjectWorldState(project: ProjectCard) {
    if (project.worldCount === 0 || !project.primarySceneId) {
        return {
            state: "blocked" as const,
            summary: "No primary world link is recorded.",
            detail: "Link a real world to the project before it can be safely shared or operated.",
        };
    }

    if (!project.primaryEnvironmentLabel) {
        return {
            state: "at_risk" as const,
            summary: "World link exists, but the primary environment label is missing.",
            detail: "Add a clear world label so operators can tell which linked world is intended for release.",
        };
    }

    return {
        state: "ready" as const,
        summary: `${project.worldCount} linked world${project.worldCount === 1 ? "" : "s"} are recorded.`,
        detail: "A primary linked world exists for this project.",
    };
}

function deriveProjectReviewState({
    project,
    projectRisk,
}: {
    project: ProjectCard;
    projectRisk: ReleaseReadinessContext["projectRisks"][number] | null;
}) {
    if (project.worldCount === 0) {
        return {
            state: "blocked" as const,
            summary: "Review distribution is blocked without a linked world.",
            detail: "Create a world link first, then secure review distribution can become ready.",
        };
    }

    if ((projectRisk?.activeReviewShareCount ?? 0) === 0) {
        return {
            state: "at_risk" as const,
            summary: "No active review share is currently live.",
            detail: "The project can be shared, but no active secure review link is available right now.",
        };
    }

    return {
        state: "ready" as const,
        summary: `${projectRisk?.activeReviewShareCount ?? 0} active review share${projectRisk?.activeReviewShareCount === 1 ? "" : "s"} are live.`,
        detail: "Secure review distribution is already live for this project.",
    };
}

function deriveProjectSupportState({
    projectId,
    supportThreads,
    hasSupportPath,
}: {
    projectId: string;
    supportThreads: SupportThreadSummary[];
    hasSupportPath: boolean;
}) {
    const projectThreads = supportThreads.filter((thread) => thread.projectId === projectId && (thread.status === "open" || thread.status === "pending"));
    const urgentThreads = projectThreads.filter((thread) => thread.priority === "urgent");
    const highThreads = projectThreads.filter((thread) => thread.priority === "high");

    if (urgentThreads.length > 0) {
        return {
            state: "blocked" as const,
            summary: "Urgent project support follow-up is still open.",
            detail: "An urgent project-specific support thread is unresolved, so operate readiness is blocked.",
        };
    }

    if (!hasSupportPath) {
        return {
            state: "at_risk" as const,
            summary: "No support routing path is configured for the studio.",
            detail: "Project support posture is weaker because the workspace still lacks durable support routing.",
        };
    }

    if (highThreads.length > 0) {
        return {
            state: "at_risk" as const,
            summary: "High-priority project support follow-up is still open.",
            detail: "Project support is active, but unresolved high-priority work keeps readiness below ready.",
        };
    }

    return {
        state: "ready" as const,
        summary: "Project support posture is healthy.",
        detail: "No urgent or high-priority project support issues are currently open.",
    };
}

function deriveProjectGovernanceState(governanceSnapshot: GovernanceSnapshot) {
    const topProjectItem = governanceSnapshot.items.find((item) => item.domain === "projects") ?? governanceSnapshot.items[0] ?? null;

    if (governanceSnapshot.overallStatus === "blocked" || governanceSnapshot.items.some((item) => item.severity === "urgent")) {
        return {
            state: "blocked" as const,
            summary: topProjectItem?.title ?? "Governance posture is blocking project release.",
            detail: topProjectItem?.summary ?? "Workspace governance posture is still blocking release readiness.",
        };
    }

    if (
        governanceSnapshot.overallStatus !== "aligned" ||
        governanceSnapshot.pendingApprovalCount > 0 ||
        governanceSnapshot.accessReview.status !== "completed"
    ) {
        return {
            state: "at_risk" as const,
            summary: topProjectItem?.title ?? "Governance posture is still drifting.",
            detail:
                topProjectItem?.summary ??
                "Governance posture is not fully aligned yet, so project release readiness stays at risk.",
        };
    }

    return {
        state: "ready" as const,
        summary: "Governance posture is aligned for this project.",
        detail: "No governance blockers are currently degrading project release readiness.",
    };
}

function deriveProjectCoverageState({
    projectId,
    coordinationSnapshot,
}: {
    projectId: string;
    coordinationSnapshot: CoordinationSnapshot;
}) {
    const projectItems = [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter(
        (item) => item.entityType === "project" && item.entityId === projectId,
    );
    const projectLane = coordinationSnapshot.coverage.lanes.find((lane) => lane.domain === "projects") ?? null;
    const topProjectItem = projectItems[0] ?? null;

    if (projectItems.some((item) => item.severity === "urgent")) {
        return {
            state: "blocked" as const,
            summary: topProjectItem?.title ?? "Project coordination still has urgent blockers.",
            detail: topProjectItem?.summary ?? "Urgent project-specific coordination work is still open.",
        };
    }

    if (projectItems.length > 0 || projectLane?.status === "undercovered" || (projectLane?.staleInProgressCount ?? 0) > 0) {
        return {
            state: "at_risk" as const,
            summary: topProjectItem?.title ?? "Project coverage still needs attention.",
            detail:
                topProjectItem?.summary ??
                projectLane?.gapReason ??
                "Coverage for project work is not fully aligned to the current operating posture.",
        };
    }

    return {
        state: "ready" as const,
        summary: "Project coverage is aligned.",
        detail: "No project-specific coordination or coverage blockers are currently open.",
    };
}

async function loadReleaseReadinessContextForSession(session: AuthSession): Promise<ReleaseReadinessContext> {
    const generatedAt = new Date().toISOString();
    const [workspaceState, billingOverview, roster, supportThreads, governanceSnapshot, continuitySnapshot, coordinationSnapshot, projectRisks, projects] =
        await Promise.all([
            getStudioWorkspaceStateForSession(session),
            getBillingOverviewForSession(session),
            getTeamRosterForSession(session),
            listSupportThreadsForSession(session),
            getGovernanceSnapshotForSession(session),
            getContinuitySnapshotForSession(session),
            getCoordinationSnapshotForSession(session),
            getProjectOperationsForSession(session),
            listProjectsForSession(session),
        ]);

    const studioAccess = await resolveStudioAccessPosture(session.activeStudioId, billingOverview);

    return {
        generatedAt,
        workspaceState,
        billingOverview,
        roster,
        supportThreads,
        governanceSnapshot,
        continuitySnapshot,
        coordinationSnapshot,
        projectRisks,
        projects,
        studioAccess,
    };
}

function buildProjectSnapshot(project: ProjectCard, context: ReleaseReadinessContext): ReleaseReadinessSnapshot {
    const projectRisk = context.projectRisks.find((entry) => entry.projectId === project.projectId) ?? null;
    const hasSupportPath = Boolean(
        context.workspaceState.activeStudio?.supportEmail || context.workspaceState.activeStudio?.billingEmail || context.supportThreads.length > 0,
    );

    const access = deriveAccessState(context.workspaceState, context.studioAccess);
    const billing = deriveBillingState(context.billingOverview);
    const worldLink = deriveProjectWorldState(project);
    const posture = deriveProjectPostureState({
        project,
        projectRisk,
    });
    const review = deriveProjectReviewState({
        project,
        projectRisk,
    });
    const support = deriveProjectSupportState({
        projectId: project.projectId,
        supportThreads: context.supportThreads,
        hasSupportPath,
    });
    const governance = deriveProjectGovernanceState(context.governanceSnapshot);
    const coverage = deriveProjectCoverageState({
        projectId: project.projectId,
        coordinationSnapshot: context.coordinationSnapshot,
    });
    const continuity = deriveContinuityState(context.continuitySnapshot, "projects");

    const gates: ReleaseGate[] = [
        createGate({
            gateKey: `project:${project.projectId}:access`,
            domain: "workspace",
            state: access.state,
            title: "Studio access",
            summary: access.summary,
            detail: access.detail,
            href: context.workspaceState.activeStudio ? "/app/billing" : "/app/dashboard#studio-bootstrap",
            routeLabel: context.workspaceState.activeStudio ? "Open billing" : "Create workspace",
            ownerLabel: "Billing operators",
            signalKey: null,
        }),
        createGate({
            gateKey: `project:${project.projectId}:billing`,
            domain: "billing",
            state: billing.state,
            title: "Billing posture",
            summary: billing.summary,
            detail: billing.detail,
            href: "/app/billing",
            routeLabel: "Open billing",
            ownerLabel: "Billing operators",
            signalKey: null,
        }),
        createGate({
            gateKey: `project:${project.projectId}:world-link`,
            domain: "projects",
            state: worldLink.state,
            title: "World linkage",
            summary: worldLink.summary,
            detail: worldLink.detail,
            href: `/app/worlds/${project.projectId}`,
            routeLabel: "Open world links",
            ownerLabel: "Project operators",
            signalKey: coordinationItemKeys.projectRisk(project.projectId),
        }),
        createGate({
            gateKey: `project:${project.projectId}:posture`,
            domain: "projects",
            state: posture.state,
            title: "Project posture",
            summary: posture.summary,
            detail: posture.detail,
            href: `/app/worlds/${project.projectId}`,
            routeLabel: "Open project controls",
            ownerLabel: "Project operators",
            signalKey: coordinationItemKeys.projectRisk(project.projectId),
        }),
        createGate({
            gateKey: `project:${project.projectId}:review-share`,
            domain: "projects",
            state: review.state,
            title: "Review distribution",
            summary: review.summary,
            detail: review.detail,
            href: `/app/worlds/${project.projectId}`,
            routeLabel: "Open review controls",
            ownerLabel: "Project operators",
            signalKey: coordinationItemKeys.projectRisk(project.projectId),
        }),
        createGate({
            gateKey: `project:${project.projectId}:support`,
            domain: "support",
            state: support.state,
            title: "Support posture",
            summary: support.summary,
            detail: support.detail,
            href: "/app/support",
            routeLabel: "Open support",
            ownerLabel: "Support operators",
            signalKey: null,
        }),
        createGate({
            gateKey: `project:${project.projectId}:governance`,
            domain: "governance",
            state: governance.state,
            title: "Governance posture",
            summary: governance.summary,
            detail: governance.detail,
            href: "/app/settings/governance",
            routeLabel: "Open governance",
            ownerLabel: "Owner or admin",
            signalKey: null,
        }),
        createGate({
            gateKey: `project:${project.projectId}:coverage`,
            domain: "coverage",
            state: coverage.state,
            title: "Coverage posture",
            summary: coverage.summary,
            detail: coverage.detail,
            href: "/app/team",
            routeLabel: "Open team coverage",
            ownerLabel: "Owner or admin",
            signalKey: coordinationItemKeys.projectRisk(project.projectId),
        }),
        createGate({
            gateKey: `project:${project.projectId}:continuity`,
            domain: "continuity",
            state: continuity.state,
            title: "Continuity handoff",
            summary: continuity.summary,
            detail: continuity.detail,
            href: "/app/team#lane-handoffs",
            routeLabel: "Open lane handoffs",
            ownerLabel: "Owner or admin",
            signalKey: null,
        }),
    ];

    return buildSnapshot({
        scope: "project",
        scopeId: project.projectId,
        scopeLabel: project.name,
        generatedAt: context.generatedAt,
        capabilities: [
            summarizeCapability("ship", [gates[0], gates[1], gates[2], gates[3], gates[6], gates[7], gates[8]]),
            summarizeCapability("share", [gates[0], gates[2], gates[4], gates[6]]),
            summarizeCapability("review", [gates[0], gates[2], gates[4], gates[5], gates[6]]),
            summarizeCapability("operate", [gates[1], gates[3], gates[5], gates[7], gates[8]]),
        ],
        gates,
    });
}

function buildWorkspaceSnapshot({
    context,
    projectSnapshots,
}: {
    context: ReleaseReadinessContext;
    projectSnapshots: ReleaseReadinessSnapshot[];
}) {
    const access = deriveAccessState(context.workspaceState, context.studioAccess);
    const identity = deriveIdentityState(context.workspaceState);
    const billing = deriveBillingState(context.billingOverview);
    const team = deriveTeamState(context.roster, context.coordinationSnapshot);
    const hasSupportPath = Boolean(
        context.workspaceState.activeStudio?.supportEmail || context.workspaceState.activeStudio?.billingEmail || context.supportThreads.length > 0,
    );
    const support = deriveSupportState({
        supportThreads: context.supportThreads,
        hasSupportPath,
    });
    const governance = deriveGovernanceState(context.governanceSnapshot);
    const coverage = deriveCoverageState(context.coordinationSnapshot);
    const continuity = deriveContinuityState(context.continuitySnapshot, "workspace");
    const blockedProjects = projectSnapshots.filter((snapshot) => snapshot.state === "blocked");
    const atRiskProjects = projectSnapshots.filter((snapshot) => snapshot.state === "at_risk");
    const projectsState =
        blockedProjects.length > 0
            ? {
                  state: "blocked" as const,
                  summary:
                      blockedProjects.length === 1
                          ? `${blockedProjects[0]?.scopeLabel ?? "One project"} is blocked.`
                          : `${blockedProjects.length} projects are blocked.`,
                  detail:
                      blockedProjects[0]?.summary ??
                      "At least one project is blocked, so workspace release readiness cannot be considered clean.",
              }
            : atRiskProjects.length > 0
              ? {
                    state: "at_risk" as const,
                    summary:
                        atRiskProjects.length === 1
                            ? `${atRiskProjects[0]?.scopeLabel ?? "One project"} is at risk.`
                            : `${atRiskProjects.length} projects are at risk.`,
                    detail:
                        atRiskProjects[0]?.summary ??
                        "At least one project still needs attention before the workspace is fully release-ready.",
                }
              : {
                    state: "ready" as const,
                    summary:
                        projectSnapshots.length > 0
                            ? `${projectSnapshots.length} tracked project${projectSnapshots.length === 1 ? "" : "s"} are ready.`
                            : "No tracked projects are blocking the workspace.",
                    detail: "Project posture is not currently degrading workspace release readiness.",
                };

    const gates: ReleaseGate[] = [
        createGate({
            gateKey: "workspace:access",
            domain: "workspace",
            state: access.state,
            title: "Studio access",
            summary: access.summary,
            detail: access.detail,
            href: context.workspaceState.activeStudio ? "/app/billing" : "/app/dashboard#studio-bootstrap",
            routeLabel: context.workspaceState.activeStudio ? "Open billing" : "Create workspace",
            ownerLabel: "Billing operators",
            signalKey: null,
        }),
        createGate({
            gateKey: "workspace:identity",
            domain: "workspace",
            state: identity.state,
            title: "Workspace identity",
            summary: identity.summary,
            detail: identity.detail,
            href: context.workspaceState.activeStudio ? "/app/settings/profile" : "/app/dashboard#studio-bootstrap",
            routeLabel: context.workspaceState.activeStudio ? "Open profile" : "Create workspace",
            ownerLabel: "Owner or admin",
            signalKey: null,
        }),
        createGate({
            gateKey: "workspace:billing",
            domain: "billing",
            state: billing.state,
            title: "Billing posture",
            summary: billing.summary,
            detail: billing.detail,
            href: "/app/billing",
            routeLabel: "Open billing",
            ownerLabel: "Billing operators",
            signalKey: null,
        }),
        createGate({
            gateKey: "workspace:team",
            domain: "team",
            state: team.state,
            title: "Team coverage",
            summary: team.summary,
            detail: team.detail,
            href: "/app/team",
            routeLabel: "Open team",
            ownerLabel: "Owner or admin",
            signalKey: null,
        }),
        createGate({
            gateKey: "workspace:support",
            domain: "support",
            state: support.state,
            title: "Support posture",
            summary: support.summary,
            detail: support.detail,
            href: "/app/support",
            routeLabel: "Open support",
            ownerLabel: "Support operators",
            signalKey: null,
        }),
        createGate({
            gateKey: "workspace:governance",
            domain: "governance",
            state: governance.state,
            title: "Governance posture",
            summary: governance.summary,
            detail: governance.detail,
            href: "/app/settings/governance",
            routeLabel: "Open governance",
            ownerLabel: "Owner or admin",
            signalKey: null,
        }),
        createGate({
            gateKey: "workspace:coverage",
            domain: "coverage",
            state: coverage.state,
            title: "Coverage posture",
            summary: coverage.summary,
            detail: coverage.detail,
            href: "/app/team",
            routeLabel: "Open team coverage",
            ownerLabel: "Owner or admin",
            signalKey: null,
        }),
        createGate({
            gateKey: "workspace:continuity",
            domain: "continuity",
            state: continuity.state,
            title: "Continuity handoff",
            summary: continuity.summary,
            detail: continuity.detail,
            href: "/app/team#lane-handoffs",
            routeLabel: "Open lane handoffs",
            ownerLabel: "Owner or admin",
            signalKey: null,
        }),
        createGate({
            gateKey: "workspace:projects",
            domain: "projects",
            state: projectsState.state,
            title: "Project release posture",
            summary: projectsState.summary,
            detail: projectsState.detail,
            href: "/app/worlds",
            routeLabel: "Open worlds",
            ownerLabel: "Project operators",
            signalKey: null,
        }),
    ];

    const workspaceLabel = context.workspaceState.activeStudio?.name ?? "Workspace";

    return buildSnapshot({
        scope: "workspace",
        scopeId: context.workspaceState.activeStudio?.studioId ?? null,
        scopeLabel: workspaceLabel,
        generatedAt: context.generatedAt,
        capabilities: [
            summarizeCapability("ship", [gates[0], gates[1], gates[2], gates[5], gates[6], gates[7], gates[8]]),
            summarizeCapability("share", [gates[0], gates[1], gates[4], gates[8]]),
            summarizeCapability("review", [gates[0], gates[4], gates[5], gates[8]]),
            summarizeCapability("operate", [gates[2], gates[3], gates[4], gates[6], gates[7]]),
        ],
        gates,
    });
}

export async function listProjectReadinessCardsForSession(session: AuthSession): Promise<ProjectReadinessCard[]> {
    const context = await loadReleaseReadinessContextForSession(session);

    return context.projects.map((project) => ({
        ...project,
        releaseReadiness: buildProjectSnapshot(project, context),
    }));
}

export async function getWorkspaceReleaseReadinessForSession(session: AuthSession): Promise<ReleaseReadinessSnapshot> {
    const context = await loadReleaseReadinessContextForSession(session);
    const projectSnapshots = context.projects.map((project) => buildProjectSnapshot(project, context));

    return buildWorkspaceSnapshot({
        context,
        projectSnapshots,
    });
}

export async function getProjectReadinessDetailForSession(
    session: AuthSession,
    projectId: string,
): Promise<ProjectReadinessDetail | null> {
    const [detail, context] = await Promise.all([getProjectDetailForSession(session, projectId), loadReleaseReadinessContextForSession(session)]);
    if (!detail) {
        return null;
    }

    return {
        ...detail,
        releaseReadiness: buildProjectSnapshot(detail.project, context),
    };
}

export async function getProjectReleaseReadinessSnapshotsForSession(session: AuthSession) {
    const cards = await listProjectReadinessCardsForSession(session);
    return cards.map((card) => card.releaseReadiness);
}
