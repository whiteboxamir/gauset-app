import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { findMissingContinuityHandoffDomainsForAwayMutation } from "../src/server/platform/continuity-core.ts";
import { buildNotificationFeedCounts, sortNotificationFeedItems } from "../src/server/platform/notifications-core.ts";
import {
    isTrackedPlatformSessionRevoked,
    partitionActiveTrackedPlatformSessions,
    resolveRevocableTrackedPlatformSessionIds,
} from "../src/server/platform/security-core.ts";
import { deriveWorldTruthSummary } from "../src/server/world-truth.ts";

const workspaceRoot = process.cwd();

function readJsonFixture<T = Record<string, any>>(relativePath: string): T {
    return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8")) as T;
}

function testNotificationLifecycleScenario() {
    const deliveries = [
        {
            id: "support-urgent",
            state: "pending" as const,
            stateChangedAt: "2026-03-13T12:00:00.000Z",
            signal: {
                severity: "urgent" as const,
                resolvedAt: null,
            },
        },
        {
            id: "workspace-watch",
            state: "delivered" as const,
            stateChangedAt: "2026-03-13T11:00:00.000Z",
            signal: {
                severity: "warning" as const,
                resolvedAt: null,
            },
        },
        {
            id: "billing-history",
            state: "acknowledged" as const,
            stateChangedAt: "2026-03-13T13:00:00.000Z",
            signal: {
                severity: "urgent" as const,
                resolvedAt: "2026-03-13T12:30:00.000Z",
            },
        },
    ];

    const initial = sortNotificationFeedItems(deliveries);
    assert.deepEqual(initial.map((delivery) => delivery.id), ["support-urgent", "workspace-watch", "billing-history"]);
    assert.deepEqual(buildNotificationFeedCounts(initial.map((delivery) => delivery.state)), {
        unreadCount: 2,
        pendingCount: 2,
        acknowledgedCount: 1,
        dismissedCount: 0,
    });

    const afterTriaging = sortNotificationFeedItems(
        deliveries.map((delivery) => {
            if (delivery.id === "support-urgent") {
                return {
                    ...delivery,
                    state: "acknowledged" as const,
                    stateChangedAt: "2026-03-13T13:05:00.000Z",
                };
            }

            if (delivery.id === "workspace-watch") {
                return {
                    ...delivery,
                    state: "dismissed" as const,
                    stateChangedAt: "2026-03-13T13:06:00.000Z",
                };
            }

            return delivery;
        }),
    );

    assert.equal(afterTriaging[0]?.id, "support-urgent");
    assert.deepEqual(buildNotificationFeedCounts(afterTriaging.map((delivery) => delivery.state)), {
        unreadCount: 0,
        pendingCount: 0,
        acknowledgedCount: 2,
        dismissedCount: 1,
    });
}

function testTrackedSessionScenario() {
    const startedSessions = [
        {
            sessionId: "session-current",
            revokedAt: null,
            isCurrent: true,
        },
        {
            sessionId: "session-desktop",
            revokedAt: null,
            isCurrent: false,
        },
        {
            sessionId: "session-mobile",
            revokedAt: null,
            isCurrent: false,
        },
    ];

    const initialInventory = partitionActiveTrackedPlatformSessions(startedSessions);
    assert.equal(initialInventory.currentSession?.sessionId, "session-current");
    assert.deepEqual(initialInventory.otherSessions.map((session) => session.sessionId), ["session-desktop", "session-mobile"]);

    const afterRevokeOne = startedSessions.map((session) =>
        session.sessionId === "session-mobile" ? { ...session, revokedAt: "2026-03-13T13:10:00.000Z" } : session,
    );
    const inventoryAfterRevokeOne = partitionActiveTrackedPlatformSessions(afterRevokeOne);
    assert.deepEqual(inventoryAfterRevokeOne.otherSessions.map((session) => session.sessionId), ["session-desktop"]);
    assert.equal(isTrackedPlatformSessionRevoked(afterRevokeOne.find((session) => session.sessionId === "session-mobile")?.revokedAt ?? null), true);

    const revokeOthersIds = resolveRevocableTrackedPlatformSessionIds(afterRevokeOne, "session-current");
    assert.deepEqual(revokeOthersIds, ["session-desktop"]);

    const afterRevokeOthers = afterRevokeOne.map((session) =>
        revokeOthersIds.includes(session.sessionId) ? { ...session, revokedAt: "2026-03-13T13:11:00.000Z" } : session,
    );
    assert.equal(partitionActiveTrackedPlatformSessions(afterRevokeOthers).otherSessions.length, 0);

    const afterLogout = afterRevokeOthers.map((session) =>
        session.sessionId === "session-current" ? { ...session, revokedAt: "2026-03-13T13:12:00.000Z" } : session,
    );
    assert.equal(isTrackedPlatformSessionRevoked(afterLogout.find((session) => session.sessionId === "session-current")?.revokedAt ?? null), true);
    assert.equal(partitionActiveTrackedPlatformSessions(afterLogout).currentSession, null);
}

function testContinuityAwayMutationScenario() {
    const blockedDomains = findMissingContinuityHandoffDomainsForAwayMutation({
        requireHandoffForUrgentAway: true,
        coveredDomains: ["support", "projects"],
        urgentOwnedDomains: ["support", "workspace", "support"],
        handoffs: [
            {
                domain: "support",
                summary: null,
            },
            {
                domain: "projects",
                summary: "Jordan covers risk triage until Monday review.",
            },
        ],
    });

    assert.deepEqual(blockedDomains, ["support"]);

    const clearedDomains = findMissingContinuityHandoffDomainsForAwayMutation({
        requireHandoffForUrgentAway: true,
        coveredDomains: ["support", "projects"],
        urgentOwnedDomains: ["support", "projects"],
        handoffs: [
            {
                domain: "support",
                summary: "Jordan covers urgent support while Alex is away.",
            },
            {
                domain: "projects",
                summary: "Jordan covers risk triage until Monday review.",
            },
        ],
    });

    assert.deepEqual(clearedDomains, []);

    const policyDisabled = findMissingContinuityHandoffDomainsForAwayMutation({
        requireHandoffForUrgentAway: false,
        coveredDomains: ["support"],
        urgentOwnedDomains: ["support"],
        handoffs: [
            {
                domain: "support",
                summary: null,
            },
        ],
    });

    assert.deepEqual(policyDisabled, []);
}

function testSceneDocumentFirstIngestToReviewScenario() {
    const ingestRecord = readJsonFixture("contracts/schemas/world-ingest.record.response.json");
    const reviewPackage = readJsonFixture("contracts/schemas/review-package.inline.scene-document-first.json");
    const readyManifest = readJsonFixture("contracts/schemas/downstream-handoff.unreal.ready.manifest.json");

    assert.equal(ingestRecord.ingest_id, readyManifest.source.ingest_record_id);
    assert.equal(ingestRecord.workspace_binding.scene_id, reviewPackage.sceneId);
    assert.equal(readyManifest.source.scene_id, reviewPackage.sceneId);
    assert.equal(readyManifest.source.version_id, reviewPackage.versionId);
    assert.equal(ingestRecord.versioning.latest_version_id, reviewPackage.versionId);
    assert.equal(reviewPackage.sceneDocument.version, readyManifest.scene_document.version);
    assert.equal(reviewPackage.sceneDocument.version, ingestRecord.scene_document.version);
    assert.equal(reviewPackage.sceneDocument.splats.splat_backlot_env.metadata.lane, readyManifest.truth.lane);
    assert.equal(ingestRecord.workflow.review_ready, true);
    assert.equal(ingestRecord.workflow.share_ready, true);
}

function testPreviewHandoffBlockerScenario() {
    const blockedManifest = readJsonFixture("contracts/schemas/downstream-handoff.unreal.preview-blocked.manifest.json");

    assert.equal(blockedManifest.target.system, "unreal_engine");
    assert.equal(blockedManifest.truth.lane, "preview");
    assert.equal(blockedManifest.delivery.status, "blocked");
    assert.ok(blockedManifest.truth.blockers.includes("preview_not_reconstruction"));
    assert.ok(blockedManifest.truth.blockers.includes("review_not_approved"));
    assert.ok(blockedManifest.truth.blockers.includes("version_not_locked"));
    assert.ok(blockedManifest.delivery.requirements.some((requirement: { key?: string; passed?: boolean }) => requirement.key === "version_locked" && requirement.passed === false));
}

function testApprovedReconstructionHandoffScenario() {
    const readyManifest = readJsonFixture("contracts/schemas/downstream-handoff.unreal.ready.manifest.json");

    assert.equal(readyManifest.target.system, "unreal_engine");
    assert.equal(readyManifest.review.approval_state, "approved");
    assert.equal(readyManifest.review.version_locked, true);
    assert.equal(readyManifest.truth.lane, "reconstruction");
    assert.equal(readyManifest.truth.production_readiness, "ready_for_downstream");
    assert.deepEqual(readyManifest.truth.blockers, []);
    assert.equal(readyManifest.delivery.status, "ready_for_downstream");
    assert.ok(readyManifest.delivery.requirements.every((requirement: { passed?: boolean }) => requirement.passed === true));
}

function testProjectLinkToReviewShareTruthScenario() {
    const reviewPackage = readJsonFixture("contracts/schemas/review-package.inline.scene-document-first.json");
    const readyManifest = readJsonFixture("contracts/schemas/downstream-handoff.unreal.ready.manifest.json");
    const truth = deriveWorldTruthSummary({
        sceneId: reviewPackage.sceneId,
        versionId: reviewPackage.versionId,
        sceneDocument: reviewPackage.sceneDocument,
        sceneGraph: reviewPackage.sceneGraph,
    });

    assert.equal(truth?.latestVersionId, reviewPackage.versionId);
    assert.equal(truth?.lane, readyManifest.truth.lane);
    assert.equal(truth?.deliveryStatus, readyManifest.delivery.status);
    assert.equal(truth?.ingestRecordId, readyManifest.source.ingest_record_id);
    assert.equal(truth?.downstreamTargetLabel, readyManifest.target.label);
}

function testProjectLinkReviewShareHandoffContinuityScenario() {
    const reviewPackage = readJsonFixture("contracts/schemas/review-package.inline.scene-document-first.json");
    const readyManifest = readJsonFixture("contracts/schemas/downstream-handoff.unreal.ready.manifest.json");
    const reviewPackageMetadata =
        reviewPackage.sceneGraph?.environment?.metadata ??
        reviewPackage.sceneDocument?.splats?.splat_backlot_env?.metadata ??
        reviewPackage.scene_document?.environment?.metadata ??
        reviewPackage.scene_graph?.environment?.metadata ??
        {};

    const projectWorldTruth = deriveWorldTruthSummary({
        sceneId: reviewPackage.sceneId,
        versionId: reviewPackage.versionId,
        sceneDocument: reviewPackage.sceneDocument,
        sceneGraph: reviewPackage.sceneGraph,
    });

    const reviewShareTruth = deriveWorldTruthSummary({
        sceneId: reviewPackage.sceneId,
        versionId: reviewPackage.versionId,
        sceneDocument: reviewPackage.sceneDocument,
        sceneGraph: reviewPackage.sceneGraph,
    });

    assert.equal(projectWorldTruth?.sourceKind, reviewShareTruth?.sourceKind);
    assert.equal(projectWorldTruth?.latestVersionId, readyManifest.source.version_id);
    assert.equal(reviewShareTruth?.latestVersionId, readyManifest.source.version_id);
    assert.equal(projectWorldTruth?.ingestRecordId, readyManifest.source.ingest_record_id);
    assert.equal(reviewShareTruth?.ingestRecordId, readyManifest.source.ingest_record_id);
    assert.equal(projectWorldTruth?.lane, readyManifest.truth.lane);
    assert.equal(reviewShareTruth?.lane, readyManifest.truth.lane);
    assert.equal(projectWorldTruth?.deliveryStatus, readyManifest.delivery.status);
    assert.equal(reviewShareTruth?.deliveryStatus, readyManifest.delivery.status);
    assert.equal(
        reviewShareTruth?.downstreamTargetSummary,
        reviewPackageMetadata?.handoff_manifest?.summary || reviewPackageMetadata?.delivery?.summary || `Delivery target: ${reviewPackageMetadata?.target_label ?? "unavailable"}`,
    );
    assert.equal(
        projectWorldTruth?.downstreamTargetSummary,
        reviewPackageMetadata?.handoff_manifest?.summary || reviewPackageMetadata?.delivery?.summary || `Delivery target: ${reviewPackageMetadata?.target_label ?? "unavailable"}`,
    );
    assert.deepEqual(projectWorldTruth?.blockers ?? [], readyManifest.truth.blockers);
    assert.deepEqual(reviewShareTruth?.blockers ?? [], readyManifest.truth.blockers);
}

function testProjectWorldLinkRehearsalAssumptionsScenario() {
    const activeLinks = [
        {
            sceneId: "scene_backlot_01",
            projectId: "project_a",
            ownershipStatus: "active" as const,
            createdAt: "2026-03-17T10:00:00.000Z",
        },
        {
            sceneId: "scene_backlot_01",
            projectId: "project_b",
            ownershipStatus: "active" as const,
            createdAt: "2026-03-17T10:05:00.000Z",
        },
        {
            sceneId: "scene_backlot_01",
            projectId: "project_c",
            ownershipStatus: "released" as const,
            createdAt: "2026-03-17T10:10:00.000Z",
        },
    ];

    const activeOwners = activeLinks
        .filter((link) => link.ownershipStatus === "active")
        .map((link) => link.projectId);

    assert.deepEqual(activeOwners, ["project_a", "project_b"]);
    assert.equal(new Set(activeOwners).size, 2);
    assert.ok(activeOwners.length > 1, "The rehearsal should flag a duplicate active-owner scene before rollout.");
}

testNotificationLifecycleScenario();
testTrackedSessionScenario();
testContinuityAwayMutationScenario();
testSceneDocumentFirstIngestToReviewScenario();
testPreviewHandoffBlockerScenario();
testApprovedReconstructionHandoffScenario();
testProjectLinkToReviewShareTruthScenario();
testProjectLinkReviewShareHandoffContinuityScenario();
testProjectWorldLinkRehearsalAssumptionsScenario();

console.log("Platform scenario checks passed.");
