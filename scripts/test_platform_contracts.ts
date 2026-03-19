import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deriveContinuityHealthSummary, deriveImplicitReviewByAt, deriveLaneContinuityEvaluation } from "../src/server/platform/continuity-core.ts";
import { isSameOriginMutation } from "../src/server/auth/mutations.ts";
import { getAuthSurfaceStatus } from "../src/server/auth/surface.ts";
import { resolveTrackedPlatformSessionAccess } from "../src/server/auth/tracked-session.ts";
import { deriveMvpAccessPosture } from "../src/server/billing/surface.ts";
import {
    buildDigestDomainCounts,
    buildNotificationFeedCounts,
    deriveNotificationAudience,
    isNotificationShellSnapshotFresh,
    resolveNotificationDeliveryDecision,
    upsertDerivedSignalCandidate,
} from "../src/server/platform/notifications-core.ts";
import { buildProjectReadinessNotificationPreview, deriveReleaseReadinessState } from "../src/server/platform/release-readiness-core.ts";
import { deriveAccessReasonSummaries, inferPlatformSessionLabel, shouldTouchPlatformSession } from "../src/server/platform/security-core.ts";
import { resolveMvpAccessMode, resolveMvpWorkspaceAccessDecision } from "../src/server/mvp/access-gate.ts";
import { getPlatformActivationReadiness } from "../src/server/platform/activation-readiness.ts";
import {
    buildLocalDraftSessionKey,
    buildLocalDraftStorageKey,
    LEGACY_LOCAL_DRAFT_KEY,
    LOCAL_DRAFT_KEY_PREFIX,
    LOCAL_DRAFT_SESSION_KEY_PREFIX,
    normalizeStoredSceneSnapshot,
} from "../src/app/mvp/_hooks/mvpWorkspaceSessionShared.ts";
import { buildReviewPackageFromSavedVersion } from "../src/components/Editor/reviewExperienceShared.ts";
import { projectWorldLinkSchema } from "../src/server/contracts/projects.ts";
import { createReviewShareRequestSchema, reviewShareReadinessSchema, reviewShareSummarySchema } from "../src/server/contracts/review-shares.ts";
import { downstreamHandoffManifestSchema } from "../src/server/contracts/downstream-handoff.ts";
import { deriveWorldTruthSummary, flattenWorldTruthSummary } from "../src/server/world-truth.ts";
import { worldIngestRecordSchema } from "../src/server/contracts/world-ingest.ts";
import { buildDownstreamHandoffManifest, deriveWorldIngestRecord } from "../src/lib/world-workflow.ts";

type JsonRecord = Record<string, unknown>;

const workspaceRoot = process.cwd();

function readTextFixture(relativePath: string) {
    return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function readJsonFixture<T = JsonRecord>(relativePath: string): T {
    return JSON.parse(readTextFixture(relativePath)) as T;
}

function assertSceneDocumentShape(sceneDocument: JsonRecord | null | undefined, label: string) {
    assert.equal(sceneDocument?.version, 2, `${label} should carry SceneDocumentV2.`);
    assert.ok(Array.isArray(sceneDocument?.rootIds), `${label} should include rootIds.`);
    assert.equal(typeof sceneDocument?.nodes, "object", `${label} should include nodes.`);
    assert.equal(typeof sceneDocument?.viewer, "object", `${label} should include viewer state.`);
}

function assertCompatibilityGraphShape(sceneGraph: JsonRecord | null | undefined, label: string) {
    assert.equal(typeof sceneGraph?.environment, "object", `${label} should include environment truth.`);
    assert.ok(Array.isArray(sceneGraph?.assets), `${label} should include asset entries.`);
    assert.equal(typeof sceneGraph?.viewer, "object", `${label} should include viewer state.`);
    assert.equal(sceneGraph?.__scene_document_v2?.version, 2, `${label} should embed a compatibility SceneDocumentV2.`);
}

function testNotificationSignalDedupe() {
    const signals = new Map<string, { severity: string; resolvedAt: string | null; updatedAt: string }>();

    upsertDerivedSignalCandidate(signals, {
        signalKey: "coverage:workspace",
        severity: "info",
        resolvedAt: null,
        updatedAt: "2026-03-13T08:00:00.000Z",
    });
    upsertDerivedSignalCandidate(signals, {
        signalKey: "coverage:workspace",
        severity: "urgent",
        resolvedAt: null,
        updatedAt: "2026-03-13T08:05:00.000Z",
    });

    assert.equal(signals.get("coverage:workspace")?.severity, "urgent");

    upsertDerivedSignalCandidate(signals, {
        signalKey: "continuity:support",
        severity: "warning",
        resolvedAt: "2026-03-13T08:10:00.000Z",
        updatedAt: "2026-03-13T08:10:00.000Z",
    });
    upsertDerivedSignalCandidate(signals, {
        signalKey: "continuity:support",
        severity: "info",
        resolvedAt: null,
        updatedAt: "2026-03-13T08:11:00.000Z",
    });

    assert.equal(signals.get("continuity:support")?.resolvedAt, null);
}

function testNotificationRoutingAndCounts() {
    const billingAudience = deriveNotificationAudience({
        domain: "billing",
        role: "finance",
        active: true,
        canUsePrioritySupport: false,
        canInviteSeats: false,
    });
    assert.equal(billingAudience.deliver, true);

    const mutedDecision = resolveNotificationDeliveryDecision({
        audience: billingAudience,
        inAppEnabled: true,
        subscriptionFollowing: false,
    });
    assert.equal(mutedDecision.deliver, false);
    assert.match(mutedDecision.reason, /muted/i);

    const governanceAudience = deriveNotificationAudience({
        domain: "governance",
        role: "member",
        active: true,
        canUsePrioritySupport: false,
        canInviteSeats: false,
    });
    const blockedDecision = resolveNotificationDeliveryDecision({
        audience: governanceAudience,
        inAppEnabled: true,
        subscriptionFollowing: true,
    });
    assert.equal(blockedDecision.deliver, false);
    assert.match(blockedDecision.reason, /owner and admin/i);

    const enabledDecision = resolveNotificationDeliveryDecision({
        audience: billingAudience,
        inAppEnabled: true,
        subscriptionFollowing: true,
    });
    assert.equal(enabledDecision.deliver, true);

    const unreadCounts = buildNotificationFeedCounts(["pending", "delivered", "acknowledged", "dismissed"]);
    assert.deepEqual(unreadCounts, {
        unreadCount: 2,
        pendingCount: 2,
        acknowledgedCount: 1,
        dismissedCount: 1,
    });

    const afterAcknowledgeAndDismiss = buildNotificationFeedCounts(["acknowledged", "dismissed"]);
    assert.equal(afterAcknowledgeAndDismiss.unreadCount, 0);
    assert.equal(afterAcknowledgeAndDismiss.pendingCount, 0);
    assert.equal(isNotificationShellSnapshotFresh("2026-03-13T09:59:30.000Z", Date.parse("2026-03-13T10:00:00.000Z")), true);
    assert.equal(isNotificationShellSnapshotFresh("2026-03-13T09:58:59.000Z", Date.parse("2026-03-13T10:00:00.000Z")), false);

    const digestCounts = buildDigestDomainCounts([
        {
            state: "delivered",
            signal: {
                domain: "support",
                severity: "urgent",
                resolvedAt: null,
            },
        },
        {
            state: "acknowledged",
            signal: {
                domain: "support",
                severity: "warning",
                resolvedAt: null,
            },
        },
        {
            state: "dismissed",
            signal: {
                domain: "billing",
                severity: "urgent",
                resolvedAt: null,
            },
        },
    ]);

    assert.equal(digestCounts.length, 1);
    assert.equal(digestCounts[0]?.domain, "support");
    assert.equal(digestCounts[0]?.urgentCount, 1);
}

function testSecurityAccessReasons() {
    const ownerReasons = deriveAccessReasonSummaries({
        role: "owner",
        hasActiveStudio: true,
        entitlements: {
            canAccessMvp: true,
            canInviteSeats: true,
            canUsePrioritySupport: true,
        },
    });
    assert.equal(ownerReasons.find((reason) => reason.key === "governance_manage")?.granted, true);
    assert.equal(ownerReasons.find((reason) => reason.key === "coverage_manage")?.granted, true);
    assert.equal(ownerReasons.find((reason) => reason.key === "seat_invites")?.granted, true);

    const financeReasons = deriveAccessReasonSummaries({
        role: "finance",
        hasActiveStudio: true,
        entitlements: {
            canAccessMvp: false,
            canInviteSeats: false,
            canUsePrioritySupport: false,
        },
    });
    assert.equal(financeReasons.find((reason) => reason.key === "billing_actions")?.granted, true);
    assert.equal(financeReasons.find((reason) => reason.key === "governance_manage")?.granted, false);

    assert.equal(
        inferPlatformSessionLabel(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
        ),
        "Mac · Safari",
    );

    const now = Date.parse("2026-03-13T10:00:00.000Z");
    assert.equal(shouldTouchPlatformSession("2026-03-13T09:56:00.000Z", now), false);
    assert.equal(shouldTouchPlatformSession("2026-03-13T09:54:59.000Z", now), true);
}

async function testAuthMutationAndSessionGuardrails() {
    const sessionRouteSource = readTextFixture("src/app/api/auth/session/route.ts");
    const logoutRouteSource = readTextFixture("src/app/api/auth/logout/route.ts");

    assert.match(sessionRouteSource, /export async function PUT\(request: NextRequest\) \{\s*if \(!isSameOriginMutation\(request\)\)/);
    assert.match(sessionRouteSource, /Cross-site session establishment requests are rejected\./);
    assert.match(sessionRouteSource, /export async function DELETE\(request: NextRequest\) \{\s*if \(!isSameOriginMutation\(request\)\)/);
    assert.match(logoutRouteSource, /export async function POST\(request: NextRequest\) \{\s*if \(!isSameOriginMutation\(request\)\)/);

    const sameOriginRequest = {
        headers: new Headers({
            origin: "https://app.example.com",
        }),
        nextUrl: new URL("https://app.example.com"),
    };
    const crossOriginRequest = {
        headers: new Headers({
            origin: "https://evil.example",
        }),
        nextUrl: new URL("https://app.example.com"),
    };
    const fetchSiteRequest = {
        headers: new Headers({
            "sec-fetch-site": "same-site",
        }),
        nextUrl: new URL("https://app.example.com"),
    };
    const missingContextRequest = {
        headers: new Headers(),
        nextUrl: new URL("https://app.example.com"),
    };

    assert.equal(isSameOriginMutation(sameOriginRequest), true);
    assert.equal(isSameOriginMutation(crossOriginRequest), false);
    assert.equal(isSameOriginMutation(fetchSiteRequest), true);
    assert.equal(isSameOriginMutation(missingContextRequest), false);

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: null,
            trackedPlatformSession: null,
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: false,
            reason: "missing_tracked_cookie",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: "session-stale",
            trackedPlatformSession: null,
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: false,
            reason: "stale_tracked_cookie",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: "session-revoked",
            trackedPlatformSession: {
                user_id: "11111111-1111-4111-8111-111111111111",
                revoked_at: "2026-03-13T10:00:00.000Z",
            },
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: false,
            reason: "revoked_tracked_session",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: "session-foreign",
            trackedPlatformSession: {
                user_id: "22222222-2222-4222-8222-222222222222",
                revoked_at: null,
            },
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: false,
            reason: "foreign_tracked_cookie",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: true,
            platformSessionId: "session-current",
            trackedPlatformSession: {
                user_id: "11111111-1111-4111-8111-111111111111",
                revoked_at: null,
            },
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: true,
            reason: "tracked_session_valid",
        },
    );

    assert.deepEqual(
        resolveTrackedPlatformSessionAccess({
            requireTrackedSession: false,
            platformSessionId: null,
            trackedPlatformSession: null,
            userId: "11111111-1111-4111-8111-111111111111",
        }),
        {
            allowed: true,
            reason: "tracked_session_not_required",
        },
    );
}

async function testMvpTruthSurfaceContracts() {
    const blockedAuthSurface = getAuthSurfaceStatus({});
    assert.equal(blockedAuthSurface.operational, false);
    assert.equal(blockedAuthSurface.tone, "blocked");
    assert.match(blockedAuthSurface.message, /cannot issue or validate email links/i);

    const gatedPosture = deriveMvpAccessPosture({
        gateEnabled: true,
        anonymousAllowed: false,
        effectiveAccess: false,
        planAccess: false,
    });
    assert.equal(gatedPosture.label, "Billing action required");
    assert.equal(gatedPosture.tone, "warning");

    const misconfiguredPosture = deriveMvpAccessPosture({
        gateEnabled: true,
        misconfigured: true,
        anonymousAllowed: false,
        effectiveAccess: false,
        planAccess: false,
    });
    assert.equal(misconfiguredPosture.label, "Gate misconfigured");
    assert.match(misconfiguredPosture.description, /fail closed/i);

    const readiness = await getPlatformActivationReadiness({
        env: {
            GAUSET_ENABLE_PLATFORM_MVP_GATE: "1",
        },
    });
    assert.equal(readiness.rollout.status, "blocked");
    assert.equal(readiness.rollout.details.gateRequested, true);
    assert.equal(readiness.rollout.details.gateMisconfigured, true);
    assert.match(readiness.rollout.summary, /Leave the MVP gate off/i);
}

function testContinuityDerivations() {
    const reviewByAt = deriveImplicitReviewByAt({
        reviewByAt: null,
        updatedAt: "2026-03-13T00:00:00.000Z",
        staleHandoffHours: 4,
    });
    assert.equal(reviewByAt, "2026-03-13T04:00:00.000Z");

    const staleLane = deriveLaneContinuityEvaluation({
        domain: "support",
        summary: "Escalate partner SLA to backup coverage.",
        activeRisks: ["Priority support SLA is exposed."],
        nextActions: ["Backup operator picks up open urgent queue."],
        reviewByAt,
        primaryOperatorLabel: "Alex",
        backupOperatorLabel: "Jordan",
        policyStaleHandoffHours: 4,
        requiredForUrgentAway: false,
        hasUrgentWork: true,
        primaryOperatorAwayWithUrgentWork: false,
        realisticCoverageMatch: true,
        now: Date.parse("2026-03-13T04:01:00.000Z"),
    });
    assert.equal(staleLane.health, "drifting");
    assert.equal(staleLane.stale, true);

    const criticalLane = deriveLaneContinuityEvaluation({
        domain: "projects",
        summary: null,
        activeRisks: [],
        nextActions: [],
        reviewByAt: null,
        primaryOperatorLabel: "Riley",
        backupOperatorLabel: null,
        policyStaleHandoffHours: 24,
        requiredForUrgentAway: true,
        hasUrgentWork: true,
        primaryOperatorAwayWithUrgentWork: true,
        realisticCoverageMatch: false,
        now: Date.parse("2026-03-13T04:01:00.000Z"),
    });
    assert.equal(criticalLane.health, "critical");
    assert.equal(criticalLane.required, true);

    const summary = deriveContinuityHealthSummary([staleLane, criticalLane]);
    assert.equal(summary.health, "critical");
    assert.equal(summary.summary.staleHandoffCount, 1);
    assert.equal(summary.summary.criticalLaneCount, 1);
    assert.equal(summary.summary.awayWithUrgentWorkCount, 1);
}

function testReleaseReadinessContracts() {
    assert.equal(deriveReleaseReadinessState(["ready"]), "ready");
    assert.equal(deriveReleaseReadinessState(["ready", "at_risk"]), "at_risk");
    assert.equal(deriveReleaseReadinessState(["ready", "blocked"]), "blocked");

    const project = {
        projectId: "11111111-1111-4aaa-8aaa-111111111111",
        name: "Museum launch",
        lastActivityAt: "2026-03-13T10:00:00.000Z",
        releaseReadiness: {
            state: "blocked",
            summary: "Museum launch is blocked by billing posture.",
            generatedAt: "2026-03-13T10:00:00.000Z",
            gates: [
                {
                    state: "blocked",
                    summary: "Subscription is past due.",
                    detail: "Billing access is drifting.",
                },
            ],
        },
    } as const;

    const signal = buildProjectReadinessNotificationPreview(project);
    assert.equal(signal.signalKey, "projects:project:11111111-1111-4aaa-8aaa-111111111111");
    assert.equal(signal.severity, "urgent");
    assert.match(signal.title, /blocked/i);
    assert.match(signal.body, /past due/i);
}

function testProjectWorldLinkOwnershipContracts() {
    const migration = readTextFixture("supabase/migrations/20260317121000_project_world_link_active_ownership.sql");

    assert.match(migration, /create unique index if not exists project_world_links_scene_active_owner_idx/i);
    assert.match(migration, /create index if not exists project_world_links_project_active_created_idx/i);
    assert.match(migration, /check \(ownership_status in \('active', 'released', 'superseded'\)\)/i);
    assert.match(migration, /alter column ownership_claimed_at set default timezone\('utc', now\(\)\)/i);
    assert.match(migration, /alter column ownership_claimed_at set not null/i);
    assert.match(migration, /when unique_violation then/i);
    assert.match(migration, /on conflict \(project_id, scene_id\) do update/i);
    assert.match(migration, /ownership_status = 'active'/i);
    assert.match(migration, /row_number\(\) over \(\s*partition by scene_id\s*order by is_primary desc, created_at asc, id asc\s*\)/i);

    const projectService = readTextFixture("src/server/projects/service.ts");
    assert.match(projectService, /select: "id,project_id,scene_id,environment_label,is_primary,ownership_status,ownership_claimed_at,created_at"/);
    assert.match(projectService, /ownershipStatus: entry\.ownership_status/);
    assert.match(projectService, /ownershipClaimedAt: entry\.ownership_claimed_at/);
    assert.match(projectService, /const claim = await claimProjectWorldLink\(\{/);
    assert.match(projectService, /if \(claim\.conflicting_project_id && claim\.conflicting_project_id !== projectId\)/);
    assert.match(projectService, /Scene ownership could not be claimed\./);
}

function testMvpGateContracts() {
    assert.deepEqual(
        resolveMvpAccessMode({
            env: {},
            databaseConfigured: true,
            authConfigured: true,
            billingConfigured: true,
        }),
        {
            status: "disabled",
            gateEnabled: false,
            misconfigured: false,
            anonymousAllowed: false,
            bypassed: true,
        },
    );

    assert.deepEqual(
        resolveMvpAccessMode({
            env: {
                GAUSET_ENABLE_PLATFORM_MVP_GATE: "0",
            },
            databaseConfigured: true,
            authConfigured: true,
            billingConfigured: true,
        }),
        {
            status: "disabled",
            gateEnabled: false,
            misconfigured: false,
            anonymousAllowed: false,
            bypassed: true,
        },
    );

    assert.deepEqual(
        resolveMvpAccessMode({
            env: {
                GAUSET_ENABLE_PLATFORM_MVP_GATE: "1",
                GAUSET_ALLOW_ANONYMOUS_MVP: "1",
            },
            databaseConfigured: true,
            authConfigured: true,
            billingConfigured: true,
        }),
        {
            status: "anonymous",
            gateEnabled: true,
            misconfigured: false,
            anonymousAllowed: true,
            bypassed: true,
        },
    );

    assert.deepEqual(
        resolveMvpAccessMode({
            env: {
                GAUSET_ENABLE_PLATFORM_MVP_GATE: "1",
            },
            databaseConfigured: true,
            authConfigured: true,
            billingConfigured: false,
        }),
        {
            status: "misconfigured",
            gateEnabled: false,
            misconfigured: true,
            anonymousAllowed: false,
            bypassed: false,
        },
    );

    assert.deepEqual(
        resolveMvpWorkspaceAccessDecision({
            gateEnabled: false,
            misconfigured: true,
            anonymousAllowed: false,
            hasSession: false,
            entitled: false,
        }),
        {
            allowed: false,
            reason: "gate_misconfigured",
        },
    );

    assert.deepEqual(
        resolveMvpWorkspaceAccessDecision({
            gateEnabled: true,
            anonymousAllowed: false,
            hasSession: false,
            entitled: false,
        }),
        {
            allowed: false,
            reason: "auth_required",
        },
    );

    assert.deepEqual(
        resolveMvpWorkspaceAccessDecision({
            gateEnabled: true,
            anonymousAllowed: false,
            hasSession: true,
            entitled: false,
        }),
        {
            allowed: false,
            reason: "billing_required",
        },
    );

    assert.deepEqual(
        resolveMvpWorkspaceAccessDecision({
            gateEnabled: true,
            anonymousAllowed: false,
            hasSession: true,
            entitled: true,
        }),
        {
            allowed: true,
            reason: "entitled",
        },
    );
}

function testMvpPersistenceContracts() {
    assert.equal(LEGACY_LOCAL_DRAFT_KEY, "gauset:mvp:draft:v1");
    assert.equal(LOCAL_DRAFT_KEY_PREFIX, "gauset:mvp:draft:v2");
    assert.equal(LOCAL_DRAFT_SESSION_KEY_PREFIX, "gauset:mvp:draft-session:v1");
    assert.equal(buildLocalDraftSessionKey("workspace"), "gauset:mvp:draft-session:v1:workspace");
    assert.equal(buildLocalDraftSessionKey("preview"), "gauset:mvp:draft-session:v1:preview");
    assert.equal(
        buildLocalDraftStorageKey({
            routeVariant: "workspace",
            studioId: "studio-456",
            userId: "user-123",
        }),
        "gauset:mvp:draft:v2:workspace:studio_studio-456:user_user-123",
    );
    assert.equal(
        buildLocalDraftStorageKey({
            routeVariant: "preview",
            sessionId: "session-abc",
        }),
        "gauset:mvp:draft:v2:preview:studio_none:session_session-abc",
    );

    const normalizedSnapshot = normalizeStoredSceneSnapshot({
        sceneGraph: {
            environment: {
                lane: "preview",
            },
            assets: [],
            camera_views: [],
            pins: [],
            director_path: [],
            director_brief: "",
            viewer: {
                fov: 45,
                lens_mm: 35,
            },
        },
    });
    assertSceneDocumentShape(normalizedSnapshot.sceneDocument, "Normalized MVP snapshot");
    assertCompatibilityGraphShape(normalizedSnapshot.sceneGraph, "Normalized MVP compatibility graph");
    assert.equal(normalizedSnapshot.sceneGraph.__scene_document_v2?.version, 2);
}

function testSharedTruthContractDocs() {
    const contractsReadme = readTextFixture("contracts/README.md");
    assert.match(contractsReadme, /world-ingest\.md/);
    assert.match(contractsReadme, /downstream-handoff\.md/);

    const ingestDoc = readTextFixture("contracts/world-ingest.md");
    assert.match(ingestDoc, /world-ingest\/v1/);
    assert.match(ingestDoc, /external_world_package/);
    assert.match(ingestDoc, /third_party_world_model_output/);
    assert.match(ingestDoc, /SceneDocumentV2/);

    const handoffDoc = readTextFixture("contracts/downstream-handoff.md");
    assert.match(handoffDoc, /downstream-handoff\/v1/);
    assert.match(handoffDoc, /unreal_engine/);
    assert.match(handoffDoc, /Generic JSON export is not enough/i);

    const gatesDoc = readTextFixture("docs/core-product-truth-validation-gates.md");
    for (const gate of ["Gate A", "Gate B", "Gate C", "Gate D", "Gate E"]) {
        assert.match(gatesDoc, new RegExp(gate), `${gate} should be documented.`);
    }
    assert.match(gatesDoc, /test:platform-contracts/);
    assert.match(gatesDoc, /test:platform-scenarios/);
    assert.match(gatesDoc, /test:platform-routes/);

    const packageJson = readJsonFixture<{ scripts: Record<string, string> }>("package.json");
    assert.match(packageJson.scripts["test:platform-release-gates"], /scripts\/test_platform_release_gates\.mjs/);
    assert.match(packageJson.scripts["test:platform-live-routes"], /scripts\/test_platform_live_routes\.mjs/);
    assert.match(packageJson.scripts["certify:platform-rollout"], /scripts\/certify_platform_rollout\.mjs/);
    const liveRoutesScript = readTextFixture("scripts/test_platform_live_routes.mjs");
    assert.match(liveRoutesScript, /\/mvp\/preview/);
    assert.match(liveRoutesScript, /expectGate: true/);
    const releaseGatesScript = readTextFixture("scripts/test_platform_release_gates.mjs");
    assert.match(releaseGatesScript, /\["npm", "run", "test:platform-live-routes"\]/);
    assert.match(releaseGatesScript, /GAUSET_PLATFORM_EXPECT_MVP_GATE:\s*"1"/);
    const rolloutScript = readTextFixture("scripts/certify_platform_rollout.mjs");
    assert.match(rolloutScript, /npm run test:platform-release-gates/);

    const releaseSanity = readTextFixture("runbooks/release-sanity.md");
    assert.match(releaseSanity, /npm run test:platform-release-gates/);
    assert.match(releaseSanity, /npm run certify:public/);

    const requestFlow = readTextFixture("maps/request-flow.md");
    assert.match(requestFlow, /review\/share artifact/i);
    assert.match(requestFlow, /contracts\/world-ingest\.md/);
    assert.match(requestFlow, /contracts\/downstream-handoff\.md/);
}

function testWorldIngestContracts() {
    const externalPackageRequest = readJsonFixture("contracts/schemas/world-ingest.external-world-package.request.json");
    const thirdPartyRequest = readJsonFixture("contracts/schemas/world-ingest.third-party-world-model-output.request.json");
    const ingestRecord = readJsonFixture("contracts/schemas/world-ingest.record.response.json");

    assert.equal(externalPackageRequest.contract, "world-ingest/v1");
    assert.equal(externalPackageRequest.source.kind, "external_world_package");
    assert.equal(typeof externalPackageRequest.package.entrypoints.scene_document, "string");
    assert.equal(externalPackageRequest.binding.scene_id, null);

    assert.equal(thirdPartyRequest.contract, "world-ingest/v1");
    assert.equal(thirdPartyRequest.source.kind, "third_party_world_model_output");
    assert.equal("scene_document" in thirdPartyRequest.package.entrypoints, false);
    assert.equal(typeof thirdPartyRequest.package.entrypoints.environment_splat, "string");

    assert.equal(ingestRecord.contract, "world-ingest/v1");
    assert.equal(worldIngestRecordSchema.parse(ingestRecord).contract, "world-ingest/v1");
    assert.equal(ingestRecord.status, "accepted");
    assert.equal(ingestRecord.source.kind, "third_party_world_model_output");
    assertSceneDocumentShape(ingestRecord.scene_document, "World ingest record");
    assertCompatibilityGraphShape(ingestRecord.compatibility_scene_graph, "World ingest compatibility graph");
    assert.equal(ingestRecord.workspace_binding.project_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(ingestRecord.workspace_binding.scene_id, "scene_backlot_reconstruction_01");
    assert.equal(ingestRecord.versioning.version_required, true);
    assert.equal(ingestRecord.workflow.save_ready, true);
    assert.equal(ingestRecord.workflow.review_ready, true);
    assert.equal(ingestRecord.workflow.share_ready, true);
    assert.equal(ingestRecord.truth.lane, "reconstruction");
    assert.equal(ingestRecord.truth.truth_label, "Imported Reconstruction Package");
    assert.match(ingestRecord.truth.lane_truth, /did not rerun capture/i);
    assert.ok(ingestRecord.truth.blockers.includes("downstream_target_not_selected"));

    const savedVersion = readJsonFixture<JsonRecord>("contracts/schemas/scene-version.response.confirmed.json");
    const derivedRecord = deriveWorldIngestRecord({
        sceneId: String(savedVersion.scene_id),
        versionId: String(savedVersion.version_id),
        projectId: "11111111-1111-4111-8111-111111111111",
        sceneDocument: savedVersion.scene_document,
        sceneGraph: savedVersion.scene_graph,
    });
    assert.ok(derivedRecord);
    assert.equal(derivedRecord?.contract, "world-ingest/v1");
    assert.equal(derivedRecord?.workspace_binding.project_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(derivedRecord?.workflow.share_ready, true);
    assert.equal(
        derivedRecord?.package.entrypoints.workspace,
        "/mvp?scene=scene_093091ff&project=11111111-1111-4111-8111-111111111111",
    );

    const persistedRecord = JSON.parse(JSON.stringify(ingestRecord));
    persistedRecord.workspace_binding.project_id = "22222222-2222-4222-8222-222222222222";
    persistedRecord.workspace_binding.scene_id = "scene_persisted_project_world";
    persistedRecord.versioning.version_id = "20260317T100000000Z";
    persistedRecord.versioning.version_locked = true;
    const persistedSceneDocument = JSON.parse(JSON.stringify(ingestRecord.scene_document));
    const persistedSceneGraph = JSON.parse(JSON.stringify(ingestRecord.compatibility_scene_graph));
    const primarySplatId = Object.keys(persistedSceneDocument.splats ?? {})[0];
    if (primarySplatId) {
        persistedSceneDocument.splats[primarySplatId].metadata = {
            ...(persistedSceneDocument.splats[primarySplatId].metadata ?? {}),
            ingest_record: persistedRecord,
        };
    }
    persistedSceneGraph.environment = {
        ...(persistedSceneGraph.environment ?? {}),
        metadata: {
            ...(persistedSceneGraph.environment?.metadata ?? {}),
            ingest_record: persistedRecord,
        },
    };
    const preservedRecord = deriveWorldIngestRecord({
        sceneId: "scene_runtime_override",
        versionId: "20260318T120000000Z",
        projectId: "11111111-1111-4111-8111-111111111111",
        sceneDocument: persistedSceneDocument,
        sceneGraph: persistedSceneGraph,
    });
    assert.equal(preservedRecord?.workspace_binding.project_id, "22222222-2222-4222-8222-222222222222");
    assert.equal(preservedRecord?.workspace_binding.scene_id, "scene_persisted_project_world");
    assert.equal(preservedRecord?.versioning.version_id, "20260317T100000000Z");
}

function testReviewVersionShareContracts() {
    const reviewPackage = readJsonFixture("contracts/schemas/review-package.inline.scene-document-first.json");
    const sceneVersion = readJsonFixture("contracts/schemas/scene-version.response.confirmed.json");
    const sceneReview = readJsonFixture("contracts/schemas/scene-review.response.confirmed.json");

    assertSceneDocumentShape(reviewPackage.sceneDocument, "Review package scene document");
    assertCompatibilityGraphShape(reviewPackage.sceneGraph, "Review package compatibility graph");
    assert.equal(reviewPackage.sceneId, reviewPackage.review.scene_id);
    assert.equal(reviewPackage.sceneDocument.review.scene_id, reviewPackage.sceneId);
    assert.equal(reviewPackage.sceneDocument.review.approval.state, reviewPackage.review.approval.state);
    assert.equal(reviewPackage.versionId, reviewPackage.review.issues[0]?.version_id);
    assert.equal(reviewPackage.summary.assetCount, reviewPackage.sceneGraph.assets.length);
    assert.equal(reviewPackage.summary.hasEnvironment, true);
    assert.equal(reviewPackage.sceneGraph.environment.metadata.lane, reviewPackage.sceneDocument.splats.splat_backlot_env.metadata.lane);
    assert.equal(reviewPackage.sceneGraph.environment.metadata.truth_label, reviewPackage.sceneDocument.splats.splat_backlot_env.metadata.truth_label);

    assert.equal(sceneVersion.source, "manual");
    assert.equal(sceneVersion.summary.has_environment, true);
    assert.equal(typeof sceneVersion.version_id, "string");
    assert.equal(typeof sceneReview.scene_id, "string");
    assert.equal(sceneReview.approval.state, "in_review");
    assert.ok(Array.isArray(sceneReview.approval.history));
}

function testDownstreamHandoffContracts() {
    const readyManifest = readJsonFixture("contracts/schemas/downstream-handoff.unreal.ready.manifest.json");
    const blockedManifest = readJsonFixture("contracts/schemas/downstream-handoff.unreal.preview-blocked.manifest.json");

    assert.equal(readyManifest.contract, "downstream-handoff/v1");
    assert.equal(downstreamHandoffManifestSchema.parse(readyManifest).contract, "downstream-handoff/v1");
    assert.equal(readyManifest.target.system, "unreal_engine");
    assert.equal(readyManifest.target.profile, "unreal_scene_package/v1");
    assert.equal(readyManifest.target.coordinate_system, "left_handed_z_up");
    assert.equal(readyManifest.target.unit_scale, "centimeter");
    assertSceneDocumentShape(readyManifest.scene_document, "Ready handoff scene document");
    assertCompatibilityGraphShape(readyManifest.compatibility_scene_graph, "Ready handoff compatibility graph");
    assert.equal(readyManifest.review.approval_state, "approved");
    assert.equal(readyManifest.review.version_locked, true);
    assert.equal(readyManifest.truth.lane, "reconstruction");
    assert.equal(readyManifest.truth.production_readiness, "ready_for_downstream");
    assert.deepEqual(readyManifest.truth.blockers, []);
    assert.equal(readyManifest.delivery.status, "ready_for_downstream");
    assert.ok(readyManifest.payload.files.some((file: { kind?: string }) => file.kind === "review_package"));
    assert.ok(readyManifest.delivery.requirements.every((requirement: { passed?: boolean }) => requirement.passed === true));

    assert.equal(blockedManifest.contract, "downstream-handoff/v1");
    assert.equal(blockedManifest.target.system, "unreal_engine");
    assertSceneDocumentShape(blockedManifest.scene_document, "Blocked handoff scene document");
    assertCompatibilityGraphShape(blockedManifest.compatibility_scene_graph, "Blocked handoff compatibility graph");
    assert.equal(blockedManifest.review.approval_state, "in_review");
    assert.equal(blockedManifest.review.version_locked, false);
    assert.equal(blockedManifest.truth.lane, "preview");
    assert.equal(blockedManifest.truth.production_readiness, "blocked");
    assert.ok(blockedManifest.truth.blockers.includes("preview_not_reconstruction"));
    assert.equal(blockedManifest.delivery.status, "blocked");
    assert.ok(blockedManifest.delivery.requirements.some((requirement: { key?: string; passed?: boolean }) => requirement.key === "review_approved" && requirement.passed === false));

    const builtManifest = buildDownstreamHandoffManifest({
        projectId: "11111111-1111-4111-8111-111111111111",
        sceneId: "scene_backlot_reconstruction_01",
        versionId: "20260316T173000000Z",
        sceneDocument: readyManifest.scene_document,
        sceneGraph: readyManifest.compatibility_scene_graph,
        ingestRecord: readyManifest.source.ingest_record_id
            ? {
                  contract: "world-ingest/v1",
                  ingest_id: readyManifest.source.ingest_record_id,
                  status: "accepted",
                  source: {
                      kind: readyManifest.truth.source_kind,
                      label: "Backlot reconstruction",
                      vendor: null,
                      captured_at: "2026-03-16T17:30:00.000Z",
                      source_uri: null,
                      origin: null,
                      ingest_channel: null,
                  },
                  package: {
                      media_type: "application/x-gauset-scene-document+json",
                      checksum_sha256: null,
                      entrypoints: {
                          workspace: "/mvp?scene=scene_backlot_reconstruction_01",
                          review: "/mvp/review?scene=scene_backlot_reconstruction_01",
                      },
                      files: {
                          metadata: "/api/mvp/storage/scenes/scene_backlot_reconstruction_01/environment/metadata.json",
                      },
                  },
                  scene_document: readyManifest.scene_document,
                  compatibility_scene_graph: readyManifest.compatibility_scene_graph,
                  workspace_binding: {
                      project_id: "11111111-1111-4111-8111-111111111111",
                      scene_id: "scene_backlot_reconstruction_01",
                  },
                  versioning: {
                      version_id: "20260316T173000000Z",
                      version_locked: true,
                  },
                  workflow: {
                      workspace_path: "/mvp?scene=scene_backlot_reconstruction_01",
                      review_path: "/mvp/review?scene=scene_backlot_reconstruction_01",
                      share_path: "/mvp/review?scene=scene_backlot_reconstruction_01&version=20260316T173000000Z",
                      save_ready: true,
                      review_ready: true,
                      share_ready: true,
                  },
                  truth: {
                      lane: "reconstruction",
                      truth_label: "Imported Reconstruction Package",
                      lane_truth: "Imported from a third-party reconstruction output.",
                      production_readiness: "handoff_ready",
                      blockers: [],
                  },
              }
            : null,
        checkedBy: "platform-contracts",
        targetSystem: "unreal_engine",
        targetProfile: "unreal_scene_package/v1",
    });
    assert.equal(builtManifest.contract, "downstream-handoff/v1");
    assert.equal(builtManifest.target.system, "unreal_engine");
    assert.equal(builtManifest.review.version_locked, true);

    assert.throws(
        () =>
            buildDownstreamHandoffManifest({
                projectId: "11111111-1111-4111-8111-111111111111",
                sceneId: "scene_backlot_reconstruction_01",
                versionId: "",
                sceneDocument: readyManifest.scene_document,
                sceneGraph: readyManifest.compatibility_scene_graph,
                targetSystem: "unreal_engine",
                targetProfile: "unreal_scene_package/v1",
            }),
        /saved version/i,
    );

    assert.throws(
        () =>
            buildDownstreamHandoffManifest({
                projectId: "11111111-1111-4111-8111-111111111111",
                sceneId: "scene_backlot_reconstruction_01",
                versionId: "20260316T173000000Z",
                sceneDocument: readyManifest.scene_document,
                sceneGraph: readyManifest.compatibility_scene_graph,
                ingestRecord: {
                    contract: "world-ingest/v1",
                    ingest_id: "ingest_mismatched_project",
                    status: "accepted",
                    source: {
                        kind: "third_party_world_model_output",
                        label: "Backlot reconstruction",
                        vendor: null,
                        captured_at: "2026-03-16T17:30:00.000Z",
                        source_uri: null,
                        origin: null,
                        ingest_channel: null,
                    },
                    package: {
                        media_type: "application/x-gauset-scene-document+json",
                        checksum_sha256: null,
                        entrypoints: {
                            workspace: "/mvp?scene=scene_backlot_reconstruction_01",
                            review: "/mvp/review?scene=scene_backlot_reconstruction_01",
                        },
                        files: {
                            metadata: "/api/mvp/storage/scenes/scene_backlot_reconstruction_01/environment/metadata.json",
                        },
                    },
                    scene_document: readyManifest.scene_document,
                    compatibility_scene_graph: readyManifest.compatibility_scene_graph,
                    workspace_binding: {
                        project_id: "99999999-9999-4999-8999-999999999999",
                        scene_id: "scene_backlot_reconstruction_01",
                    },
                    versioning: {
                        version_id: "20260316T173000000Z",
                        version_locked: true,
                    },
                    workflow: {
                        workspace_path: "/mvp?scene=scene_backlot_reconstruction_01",
                        review_path: "/mvp/review?scene=scene_backlot_reconstruction_01",
                        share_path: "/mvp/review?scene=scene_backlot_reconstruction_01&version=20260316T173000000Z",
                        save_ready: true,
                        review_ready: true,
                        share_ready: true,
                    },
                    truth: {
                        lane: "reconstruction",
                        truth_label: "Imported Reconstruction Package",
                        lane_truth: "Imported from a third-party reconstruction output.",
                        production_readiness: "handoff_ready",
                        blockers: [],
                    },
                },
                targetSystem: "unreal_engine",
                targetProfile: "unreal_scene_package/v1",
            }),
        /requested project/i,
    );
}

function testSingleJourneyRouteContracts() {
    const appHome = readTextFixture("src/app/page.tsx");
    const mvpPage = readTextFixture("src/app/mvp/page.tsx");
    const previewPage = readTextFixture("src/app/mvp/preview/page.tsx");
    const projectDetailPage = readTextFixture("src/app/(app)/app/worlds/[projectId]/page.tsx");
    const openWorkspaceButton = readTextFixture("src/components/worlds/OpenWorkspaceButton.tsx");

    assert.match(appHome, /redirect\("\/app\/worlds"\)/);
    assert.match(mvpPage, /redirect\(nextPath\)/);
    assert.match(mvpPage, /const nextPath =[\s\S]*launchSceneId[\s\S]*`\/mvp\?/);
    assert.match(previewPage, /if \(launchSceneId\) \{[\s\S]*redirect\(`\/mvp\?/);
    assert.match(projectDetailPage, /resumeSceneId=\{detail\.project\.primarySceneId\}/);
    assert.match(openWorkspaceButton, /router\.push\("\/app\/worlds"\)/);
    assert.doesNotMatch(openWorkspaceButton, /router\.push\(searchParams\.size > 0 \? `\/mvp/);
}

function testLocalPreviewJourneyContracts() {
    const worldsPage = readTextFixture("src/app/(app)/app/worlds/page.tsx");
    const projectDetailPage = readTextFixture("src/app/(app)/app/worlds/[projectId]/page.tsx");
    const localPreviewNotice = readTextFixture("src/components/platform/LocalPreviewNotice.tsx");
    const localPreviewData = readTextFixture("src/server/projects/local-preview.ts");

    assert.match(worldsPage, /getAuthSurfaceStatus/);
    assert.match(worldsPage, /resolveMvpAccessMode\(\)\.bypassed/);
    assert.match(worldsPage, /if \(!authSurfaceStatus\.authConfigured\)/);
    assert.match(worldsPage, /LocalPreviewNotice/);
    assert.match(worldsPage, /listLocalPreviewProjectReadinessCardsForSession/);
    assert.match(worldsPage, /Choose a project\. Build one world\. Save it once\./);
    assert.match(worldsPage, /Start world/);
    assert.match(worldsPage, /CreateProjectPanel id="project-composer"/);

    assert.match(projectDetailPage, /if \(!authSurfaceStatus\.authConfigured\)/);
    assert.match(projectDetailPage, /getLocalPreviewProjectReadinessDetailForId/);
    assert.match(projectDetailPage, /LocalPreviewNotice/);
    assert.match(projectDetailPage, /Start world/);
    assert.match(projectDetailPage, /Current shell/);
    assert.match(projectDetailPage, /World-first checklist/);
    assert.doesNotMatch(projectDetailPage, /requireAuthSession\("\/app\/worlds"\);[\s\S]*if \(!authSurfaceStatus\.authConfigured\)/);

    assert.match(localPreviewNotice, /canAccessMvp/);
    assert.match(localPreviewNotice, /Open world start/);
    assert.match(localPreviewNotice, /World start unavailable/);
    assert.match(localPreviewNotice, /showWorldStartAction/);

    assert.match(localPreviewData, /Backlot Scout/);
    assert.match(localPreviewData, /Warehouse Blocking/);
}

function testSceneDocumentTruthSummaryContracts() {
    const savedVersion = readJsonFixture("contracts/schemas/scene-version.response.json");
    const worldTruth = deriveWorldTruthSummary({
        sceneId: savedVersion.scene_id,
        versionId: savedVersion.version_id,
        sceneDocument: savedVersion.scene_document,
        sceneGraph: savedVersion.scene_graph,
    });

    assert.equal(worldTruth?.latestVersionId, savedVersion.version_id);
    assert.equal(worldTruth?.lane, "preview");
    assert.equal(worldTruth?.truthLabel, "Instant Preview");
    assert.equal(worldTruth?.ingestRecordId, "ingest_scene_093091ff_preview");
    assert.ok(worldTruth?.blockers.includes("preview_not_reconstruction"));
    assert.equal(worldTruth?.downstreamTargetLabel, "Unreal preview scout");

    const reviewPackage = readJsonFixture("contracts/schemas/review-package.inline.scene-document-first.json");
    const reviewTruth = deriveWorldTruthSummary({
        sceneId: reviewPackage.sceneId,
        versionId: reviewPackage.versionId,
        sceneDocument: reviewPackage.sceneDocument,
        sceneGraph: reviewPackage.sceneGraph,
    });

    assert.equal(reviewTruth?.lane, "reconstruction");
    assert.equal(reviewTruth?.ingestRecordId, "ingest_backlot_reconstruction_01");
    assert.equal(reviewTruth?.deliveryStatus, "ready_for_downstream");
    assert.equal(reviewTruth?.downstreamTargetLabel, "Unreal 5.4 backlot blockout");

    const provenanceFallbackTruth = deriveWorldTruthSummary({
        sceneId: "scene_source_provenance_fallback",
        versionId: "20260317T100000000Z",
        sceneDocument: {
            version: 2,
            splats: {
                source: {
                    id: "source",
                    metadata: {
                        lane: "preview",
                    },
                },
            },
        },
        sceneGraph: {
            environment: {
                metadata: {
                    lane: "preview",
                    source_provenance: {
                        kind: "uploaded_still",
                        image_id: "img_123",
                    },
                },
            },
        },
    });
    assert.equal(provenanceFallbackTruth?.sourceKind, "upload");
    assert.equal(provenanceFallbackTruth?.ingestRecordId, "ingest_scene_source_provenance_fallback_20260317T100000000Z_preview");
}

function testReviewShareRequestShapeContracts() {
    const reviewPackage = readJsonFixture<JsonRecord>("contracts/schemas/review-package.inline.scene-document-first.json");

    const sceneDocumentFirstPayload = createReviewShareRequestSchema.parse({
        projectId: "11111111-1111-4aaa-8aaa-111111111111",
        reviewPackage,
        expiresInHours: 24,
    });
    assert.equal(sceneDocumentFirstPayload.sceneId, undefined);
    assert.equal(sceneDocumentFirstPayload.versionId, undefined);
    assert.equal(sceneDocumentFirstPayload.reviewPackage, reviewPackage);

    const legacySceneDocumentPayload = createReviewShareRequestSchema.parse({
        sceneId: "scene_legacy_01",
        versionId: "20260308T093355180253Z",
        sceneDocument: reviewPackage.sceneDocument,
        sceneGraph: reviewPackage.sceneGraph,
        assetsList: reviewPackage.assetsList,
        label: "legacy inline path",
        note: "compatibility baseline",
    });
    assert.equal(legacySceneDocumentPayload.sceneId, "scene_legacy_01");
    assert.equal(legacySceneDocumentPayload.versionId, "20260308T093355180253Z");
    assert.equal(legacySceneDocumentPayload.sceneDocument, reviewPackage.sceneDocument);

    const legacySnakeCasePayload = createReviewShareRequestSchema.parse({
        reviewPackage: {
            scene_id: "scene_legacy_02",
            version_id: "20260308T093355180254Z",
            scene_document: reviewPackage.sceneDocument,
            scene_graph: reviewPackage.sceneGraph,
            assetsList: reviewPackage.assetsList,
            review: reviewPackage.review,
        },
    });
    assert.equal(legacySnakeCasePayload.sceneId, undefined);
    assert.equal(legacySnakeCasePayload.versionId, undefined);
    assert.equal(legacySnakeCasePayload.reviewPackage?.scene_id, "scene_legacy_02");
    assert.equal(legacySnakeCasePayload.reviewPackage?.version_id, "20260308T093355180254Z");

    const inlinePayloadOnlyPayload = createReviewShareRequestSchema.parse({
        sceneId: "scene_legacy_01",
        payload: JSON.stringify({
            sceneDocument: reviewPackage.sceneDocument,
        }),
    });
    assert.equal(inlinePayloadOnlyPayload.sceneId, "scene_legacy_01");

    assert.throws(() =>
        createReviewShareRequestSchema.parse({
            projectId: "11111111-1111-4aaa-8aaa-111111111111",
        }),
    );

    const reviewShareService = readTextFixture("src/server/review-shares/service.ts");
    assert.match(reviewShareService, /reviewPackage: hasSavedVersionIdentity \? null : resolved\.reviewPackage/);
    assert.match(reviewShareService, /sceneDocument: hasSavedVersionIdentity \? savedVersionArtifacts\?\.sceneDocument \?\? null : resolved\.sceneDocument/);
    assert.match(reviewShareService, /sceneGraph: hasSavedVersionIdentity \? savedVersionArtifacts\?\.sceneGraph \?\? null : resolved\.sceneGraph/);
    assert.match(reviewShareService, /assetsList: hasSavedVersionIdentity \? savedVersionArtifacts\?\.assetsList \?\? \[\] : resolved\.assetsList/);
    assert.match(reviewShareService, /savedVersionReadiness && !savedVersionReadiness\.canCreate/);
    assert.match(reviewShareService, /resolveSavedVersionReviewShareReadiness/);

    const blockedReadiness = reviewShareReadinessSchema.parse({
        state: "blocked",
        canCreate: false,
        sceneId: "scene_missing",
        versionId: "version_missing",
        summary: "Saved version is unavailable.",
        detail: "Secure review links stay blocked until this version exists in MVP history and the backend can load it.",
        blockers: [],
        truthSummary: null,
    });
    assert.equal(blockedReadiness.state, "blocked");
}

function testFlattenedWorldTruthContracts() {
    const reviewPackage = readJsonFixture<JsonRecord>("contracts/schemas/review-package.inline.scene-document-first.json");
    const truth = deriveWorldTruthSummary({
        sceneId: reviewPackage.sceneId,
        versionId: reviewPackage.versionId,
        sceneDocument: reviewPackage.sceneDocument,
        sceneGraph: reviewPackage.sceneGraph,
    });
    const flattened = flattenWorldTruthSummary(truth);

    const parsedWorldLink = projectWorldLinkSchema.parse({
        id: "11111111-1111-4111-8111-111111111111",
        projectId: "22222222-2222-4222-8222-222222222222",
        sceneId: reviewPackage.sceneId,
        environmentLabel: "Backlot reconstruction drop",
        isPrimary: true,
        ownershipStatus: "active",
        ownershipClaimedAt: "2026-03-17T10:00:00.000Z",
        createdAt: "2026-03-17T10:00:00.000Z",
        truthSummary: truth,
        ...flattened,
    });
    assert.equal(parsedWorldLink.lane, "reconstruction");
    assert.equal(parsedWorldLink.ingestRecordId, "ingest_backlot_reconstruction_01");
    assert.equal(parsedWorldLink.ownershipStatus, "active");
    assert.equal(parsedWorldLink.ownershipClaimedAt, "2026-03-17T10:00:00.000Z");

    const parsedReviewShare = reviewShareSummarySchema.parse({
        id: "33333333-3333-4333-8333-333333333333",
        projectId: "22222222-2222-4222-8222-222222222222",
        studioId: "44444444-4444-4444-8444-444444444444",
        createdByUserId: "55555555-5555-4555-8555-555555555555",
        createdByLabel: "Operator",
        sceneId: reviewPackage.sceneId,
        versionId: reviewPackage.versionId,
        status: "active",
        tokenId: "token_123",
        label: "Backlot review",
        note: null,
        deliveryMode: "secure_link",
        contentMode: "saved_version",
        issuedAt: "2026-03-17T10:00:00.000Z",
        expiresAt: "2026-03-24T10:00:00.000Z",
        lastAccessedAt: null,
        revokedAt: null,
        createdAt: "2026-03-17T10:00:00.000Z",
        sharePath: null,
        recentEvents: [],
        truthSummary: truth,
        ...flattened,
    });
    assert.equal(parsedReviewShare.sharePath, null);
    assert.equal(parsedReviewShare.deliveryStatus, "ready_for_downstream");
    assert.equal(parsedReviewShare.downstreamTargetSummary, "Approved reconstruction package is ready for Unreal blockout handoff.");
}

function testSavedReviewPackageTruthContracts() {
    const reviewPackageFixture = readJsonFixture<JsonRecord>("contracts/schemas/review-package.inline.scene-document-first.json");
    const savedVersionPackage = buildReviewPackageFromSavedVersion({
        sceneId: String(reviewPackageFixture.sceneId),
        versionId: String(reviewPackageFixture.versionId),
        versionPayload: {
            saved_at: reviewPackageFixture.exportedAt,
            scene_document: reviewPackageFixture.sceneDocument,
            scene_graph: reviewPackageFixture.sceneGraph,
        },
        previousPackage: null,
        previousReview: reviewPackageFixture.review as any,
        shareToken: null,
    });

    assert.equal(savedVersionPackage.truthSummary?.lane, "reconstruction");
    assert.equal(savedVersionPackage.truthSummary?.deliveryStatus, "ready_for_downstream");
    assert.deepEqual(savedVersionPackage.truthSummary?.blockers, []);
    assert.equal(savedVersionPackage.truthSummary?.downstreamTargetLabel, "Unreal 5.4 backlot blockout");
    assert.equal(savedVersionPackage.truthSummary?.downstreamTargetSummary, "Approved reconstruction package is ready for Unreal blockout handoff.");
}

function testVersionCommentUiContracts() {
    const rightPanelVersionHistory = readTextFixture("src/components/Editor/RightPanelVersionHistorySection.tsx");
    assert.match(rightPanelVersionHistory, /Version Comments/);
    assert.match(rightPanelVersionHistory, /Pinned version note/);
    assert.match(rightPanelVersionHistory, /Add pinned comment/);

    const reviewPersistenceController = readTextFixture("src/app/mvp/_hooks/useMvpWorkspaceReviewPersistenceController.ts");
    assert.match(reviewPersistenceController, /submitVersionComment/);
    assert.match(reviewPersistenceController, /setVersionCommentDraftField/);
    assert.match(reviewPersistenceController, /canSubmitComment/);

    const publicPlaywrightSpec = readTextFixture("tests/mvp.public.spec.js");
    assert.match(publicPlaywrightSpec, /async function addPinnedVersionComment/);
    assert.doesNotMatch(publicPlaywrightSpec, /page\.request\.post\(`\$\{BASE\}\/api\/mvp\/scene\/\$\{sceneId\}\/versions\/\$\{versionId\}\/comments`/);
}

testNotificationSignalDedupe();
testNotificationRoutingAndCounts();
testSecurityAccessReasons();
await testAuthMutationAndSessionGuardrails();
await testMvpTruthSurfaceContracts();
testContinuityDerivations();
testReleaseReadinessContracts();
testProjectWorldLinkOwnershipContracts();
testMvpGateContracts();
testMvpPersistenceContracts();
testSharedTruthContractDocs();
testWorldIngestContracts();
testReviewVersionShareContracts();
testDownstreamHandoffContracts();
testSingleJourneyRouteContracts();
testLocalPreviewJourneyContracts();
testSceneDocumentTruthSummaryContracts();
testReviewShareRequestShapeContracts();
testFlattenedWorldTruthContracts();
testSavedReviewPackageTruthContracts();
testVersionCommentUiContracts();

console.log("Platform contract checks passed.");
