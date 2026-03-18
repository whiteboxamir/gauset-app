import type { AuthSession } from "@/server/contracts/auth";
import type { NotificationSignal } from "@/server/contracts/notifications";
import type { ProjectReadinessCard } from "@/server/contracts/projects";

import { getGovernanceSnapshotForSession } from "@/server/account/governance";
import { getBillingOverviewForSession } from "@/server/billing/summary";
import { logPlatformAuditEvent } from "@/server/platform/audit";
import { getCoordinationSnapshotForSession } from "@/server/platform/coordination";
import { coordinationItemKeys } from "@/server/platform/coordination-keys";
import { deriveNotificationAudience, resolveNotificationDeliveryDecision, upsertDerivedSignalCandidate } from "@/server/platform/notifications-core";
import { buildProjectReadinessNotificationPreview } from "@/server/platform/release-readiness-core";
import { listProjectReadinessCardsForSession } from "@/server/projects/readiness";
import { listSupportThreadsForSession } from "@/server/support/service";

import {
    createDefaultNotificationPreferences,
    createNotificationSignalRecordInput,
    insertNotificationDeliveries,
    mapNotificationPreferences,
    resolveActiveStudioMemberships,
    resolveExistingNotificationDeliveries,
    resolveNotificationPreferencesForUsers,
    resolveNotificationSignals,
    resolveNotificationSubscriptions,
    type NotificationSignalRecordInput,
    type NotificationSignalRow,
    upsertNotificationSignals,
} from "./notifications-store";

function deriveCoverageNarrative({
    label,
    unownedUrgentItemCount,
    unavailableOwnerItemCount,
    staleInProgressCount,
    gapReason,
}: {
    label: string;
    unownedUrgentItemCount: number;
    unavailableOwnerItemCount: number;
    staleInProgressCount: number;
    gapReason: string | null;
}) {
    const reasons: string[] = [];
    if (unownedUrgentItemCount > 0) {
        reasons.push(unownedUrgentItemCount === 1 ? "1 urgent item is unowned." : `${unownedUrgentItemCount} urgent items are unowned.`);
    }
    if (unavailableOwnerItemCount > 0) {
        reasons.push(
            unavailableOwnerItemCount === 1
                ? "1 item is still owned by an unavailable operator."
                : `${unavailableOwnerItemCount} items are still owned by unavailable operators.`,
        );
    }
    if (staleInProgressCount > 0) {
        reasons.push(staleInProgressCount === 1 ? "1 item is stale in progress." : `${staleInProgressCount} items are stale in progress.`);
    }
    if (gapReason) {
        reasons.push(gapReason);
    }

    return reasons.length > 0 ? `${label} lane needs attention because ${reasons.join(" ")}` : `${label} lane coverage needs attention.`;
}

export function createProjectReadinessNotificationSignal(project: Pick<ProjectReadinessCard, "projectId" | "name" | "lastActivityAt" | "releaseReadiness">) {
    const preview = buildProjectReadinessNotificationPreview(project);

    return createNotificationSignalRecordInput({
        signalKey: preview.signalKey,
        domain: "projects",
        severity: preview.severity,
        sourceType: "project",
        sourceId: project.projectId,
        title: preview.title,
        body: preview.body,
        href: preview.href,
        why: preview.why,
        resolvedAt: null,
        updatedAt: preview.updatedAt,
    });
}

async function deriveNotificationSignalCandidates(session: AuthSession): Promise<NotificationSignalRecordInput[]> {
    const [coordinationSnapshot, governanceSnapshot, billingOverview, supportThreads, projectReadinessCards] = await Promise.all([
        getCoordinationSnapshotForSession(session),
        getGovernanceSnapshotForSession(session),
        getBillingOverviewForSession(session),
        listSupportThreadsForSession(session),
        listProjectReadinessCardsForSession(session),
    ]);

    const signals = new Map<
        string,
        {
            signalKey: string;
            severity: NotificationSignal["severity"];
            resolvedAt: string | null;
            updatedAt: string;
            metadata: NotificationSignalRecordInput;
        }
    >();

    [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].forEach((item) => {
        upsertDerivedSignalCandidate(signals, {
            signalKey: item.itemKey,
            severity: item.severity === "urgent" ? "urgent" : "warning",
            resolvedAt: item.status === "resolved" ? item.resolvedAt : null,
            updatedAt: item.coordinationUpdatedAt ?? coordinationSnapshot.generatedAt,
            metadata: createNotificationSignalRecordInput({
                signalKey: item.itemKey,
                domain: item.domain,
                severity: item.severity === "urgent" ? "urgent" : "warning",
                sourceType: item.entityType ?? `${item.domain}_coordination`,
                sourceId: item.entityId,
                title: item.title,
                body: item.summary,
                href: item.href,
                why: item.remediation,
                resolvedAt: item.status === "resolved" ? item.resolvedAt : null,
                updatedAt: item.coordinationUpdatedAt ?? coordinationSnapshot.generatedAt,
            }),
        });
    });

    governanceSnapshot.items.forEach((item) => {
        upsertDerivedSignalCandidate(signals, {
            signalKey: `governance:${item.id}`,
            severity: item.severity === "urgent" ? "urgent" : "warning",
            resolvedAt: null,
            updatedAt: governanceSnapshot.accessReview.openedAt ?? governanceSnapshot.accessReview.completedAt ?? coordinationSnapshot.generatedAt,
            metadata: createNotificationSignalRecordInput({
                signalKey: `governance:${item.id}`,
                domain: "governance",
                severity: item.severity === "urgent" ? "urgent" : "warning",
                sourceType: "governance_attention",
                sourceId: item.id,
                title: item.title,
                body: item.summary,
                href: item.href,
                why: item.remediation,
                resolvedAt: null,
                updatedAt: coordinationSnapshot.generatedAt,
            }),
        });
    });

    coordinationSnapshot.coverage.lanes
        .filter((lane) => lane.status === "undercovered" || lane.unownedUrgentItemCount > 0 || lane.unavailableOwnerItemCount > 0 || lane.staleInProgressCount > 0)
        .forEach((lane) => {
            upsertDerivedSignalCandidate(signals, {
                signalKey: `coverage:lane:${lane.domain}`,
                severity: lane.unownedUrgentItemCount > 0 || lane.unavailableOwnerItemCount > 0 ? "urgent" : "warning",
                resolvedAt: null,
                updatedAt: coordinationSnapshot.generatedAt,
                metadata: createNotificationSignalRecordInput({
                    signalKey: `coverage:lane:${lane.domain}`,
                    domain: "coverage",
                    severity: lane.unownedUrgentItemCount > 0 || lane.unavailableOwnerItemCount > 0 ? "urgent" : "warning",
                    sourceType: "coverage_lane",
                    sourceId: lane.domain,
                    title: `${lane.label} lane needs continuity`,
                    body: deriveCoverageNarrative({
                        label: lane.label,
                        unownedUrgentItemCount: lane.unownedUrgentItemCount,
                        unavailableOwnerItemCount: lane.unavailableOwnerItemCount,
                        staleInProgressCount: lane.staleInProgressCount,
                        gapReason: lane.gapReason,
                    }),
                    href: "/app/team#coverage-roster",
                    why: lane.gapReason ?? "Coverage posture no longer matches active workload in this lane.",
                    resolvedAt: null,
                    updatedAt: coordinationSnapshot.generatedAt,
                }),
            });
        });

    if (!billingOverview.summary.subscription) {
        upsertDerivedSignalCandidate(signals, {
            signalKey: coordinationItemKeys.billingNoSubscription(),
            severity: "warning",
            resolvedAt: null,
            updatedAt: coordinationSnapshot.generatedAt,
            metadata: createNotificationSignalRecordInput({
                signalKey: coordinationItemKeys.billingNoSubscription(),
                domain: "billing",
                severity: "warning",
                sourceType: "subscription",
                sourceId: null,
                title: "No active billing plan",
                body: "This workspace has no active or trialing subscription on record.",
                href: "/app/billing",
                why: "Entitlements and portal readiness stay partially manual until a plan is provisioned.",
                resolvedAt: null,
                updatedAt: coordinationSnapshot.generatedAt,
            }),
        });
    } else if (["past_due", "unpaid", "incomplete"].includes(billingOverview.summary.subscription.status)) {
        upsertDerivedSignalCandidate(signals, {
            signalKey: coordinationItemKeys.billingSubscription(billingOverview.summary.subscription.id),
            severity: "urgent",
            resolvedAt: null,
            updatedAt: billingOverview.summary.subscription.currentPeriodEndsAt ?? coordinationSnapshot.generatedAt,
            metadata: createNotificationSignalRecordInput({
                signalKey: coordinationItemKeys.billingSubscription(billingOverview.summary.subscription.id),
                domain: "billing",
                severity: "urgent",
                sourceType: "subscription",
                sourceId: billingOverview.summary.subscription.id,
                title: `Subscription is ${billingOverview.summary.subscription.status.replaceAll("_", " ")}`,
                body: "Billing needs intervention before access and renewal posture drift further.",
                href: "/app/billing",
                why: "The active subscription status is no longer healthy.",
                resolvedAt: null,
                updatedAt: coordinationSnapshot.generatedAt,
            }),
        });
    }

    if (
        billingOverview.summary.latestInvoice &&
        ["open", "uncollectible"].includes(billingOverview.summary.latestInvoice.status) &&
        billingOverview.summary.latestInvoice.amountRemainingCents > 0
    ) {
        upsertDerivedSignalCandidate(signals, {
            signalKey: coordinationItemKeys.billingInvoice(billingOverview.summary.latestInvoice.id),
            severity: billingOverview.summary.latestInvoice.status === "uncollectible" ? "urgent" : "warning",
            resolvedAt: null,
            updatedAt: billingOverview.summary.latestInvoice.dueAt ?? billingOverview.summary.latestInvoice.issuedAt ?? coordinationSnapshot.generatedAt,
            metadata: createNotificationSignalRecordInput({
                signalKey: coordinationItemKeys.billingInvoice(billingOverview.summary.latestInvoice.id),
                domain: "billing",
                severity: billingOverview.summary.latestInvoice.status === "uncollectible" ? "urgent" : "warning",
                sourceType: "invoice",
                sourceId: billingOverview.summary.latestInvoice.id,
                title: "Invoice still needs payment attention",
                body: "The latest invoice still has remaining balance or collection risk.",
                href: "/app/billing",
                why: "Billing posture is unresolved on the latest invoice.",
                resolvedAt: null,
                updatedAt: coordinationSnapshot.generatedAt,
            }),
        });
    }

    supportThreads
        .filter((thread) => ["open", "pending"].includes(thread.status) && ["high", "urgent"].includes(thread.priority))
        .forEach((thread) => {
            upsertDerivedSignalCandidate(signals, {
                signalKey: coordinationItemKeys.supportThread(thread.threadId),
                severity: thread.priority === "urgent" ? "urgent" : "warning",
                resolvedAt: null,
                updatedAt: thread.latestMessageAt ?? thread.createdAt,
                metadata: createNotificationSignalRecordInput({
                    signalKey: coordinationItemKeys.supportThread(thread.threadId),
                    domain: "support",
                    severity: thread.priority === "urgent" ? "urgent" : "warning",
                    sourceType: "support_thread",
                    sourceId: thread.threadId,
                    title: `${thread.priority === "urgent" ? "Urgent" : "High-priority"} support thread`,
                    body: thread.subject,
                    href: `/app/support/${thread.threadId}`,
                    why: "Support thread priority and unresolved status require attention.",
                    resolvedAt: null,
                    updatedAt: thread.latestMessageAt ?? thread.createdAt,
                }),
            });
        });

    projectReadinessCards
        .filter((project) => project.releaseReadiness.state !== "ready")
        .forEach((project) => {
            const signal = createProjectReadinessNotificationSignal(project);
            upsertDerivedSignalCandidate(signals, {
                signalKey: signal.signalKey,
                severity: signal.severity,
                resolvedAt: null,
                updatedAt: signal.updatedAt,
                metadata: signal,
            });
        });

    return Array.from(signals.values()).map((entry) => entry.metadata);
}

export async function synchronizeNotificationSignalsForSession(
    session: AuthSession,
    auditActor: {
        actorUserId?: string | null;
        actorType?: "user" | "admin" | "system";
    } = {},
) {
    if (!session.activeStudioId) {
        return [] as NotificationSignalRow[];
    }

    const studioId = session.activeStudioId;
    const [existingSignals, nextSignals] = await Promise.all([resolveNotificationSignals(studioId), deriveNotificationSignalCandidates(session)]);
    const existingByKey = new Map(existingSignals.map((signal) => [signal.signal_key, signal]));
    const generationTime = new Date().toISOString();

    await upsertNotificationSignals(studioId, nextSignals);

    for (const signal of nextSignals) {
        const existing = existingByKey.get(signal.signalKey) ?? null;
        if (!existing || existing.resolved_at) {
            await logPlatformAuditEvent({
                actorUserId: auditActor.actorUserId ?? session.user.userId,
                actorType: auditActor.actorType ?? "system",
                studioId,
                targetType: "notification_signal",
                targetId: signal.signalKey,
                eventType: "notifications.signal.generated",
                summary: `Generated platform signal ${signal.title}.`,
                metadata: {
                    domain: signal.domain,
                    severity: signal.severity,
                    sourceType: signal.sourceType,
                    sourceId: signal.sourceId,
                },
            });
        }
    }

    const resolvedSignals = existingSignals.filter(
        (existing) => !nextSignals.some((candidate) => candidate.signalKey === existing.signal_key) && !existing.resolved_at,
    );

    for (const signal of resolvedSignals) {
        await upsertNotificationSignals(studioId, [
            createNotificationSignalRecordInput({
                signalKey: signal.signal_key,
                domain: signal.domain,
                severity: signal.severity,
                sourceType: signal.source_type,
                sourceId: signal.source_id,
                title: signal.title,
                body: signal.body,
                href: signal.href,
                audienceLabel: signal.audience_label,
                why: signal.why,
                resolvedAt: generationTime,
                updatedAt: generationTime,
            }),
        ]);

        await logPlatformAuditEvent({
            actorUserId: auditActor.actorUserId ?? session.user.userId,
            actorType: auditActor.actorType ?? "system",
            studioId,
            targetType: "notification_signal",
            targetId: signal.id,
            eventType: "notifications.signal.resolved",
            summary: `Resolved platform signal ${signal.title}.`,
            metadata: {
                signalKey: signal.signal_key,
                domain: signal.domain,
            },
        });
    }

    return resolveNotificationSignals(studioId);
}

export async function synchronizeNotificationDeliveriesForSession({
    session,
    signals,
}: {
    session: AuthSession;
    signals: NotificationSignalRow[];
}) {
    const studioId = session.activeStudioId;
    if (!studioId) {
        return;
    }

    const activeSignals = signals.filter((signal) => !signal.resolved_at);
    if (activeSignals.length === 0) {
        return;
    }

    const memberships = await resolveActiveStudioMemberships(studioId);
    const userIds = memberships.map((membership) => membership.user_id);
    const [subscriptionRows, preferenceRows, existingDeliveries] = await Promise.all([
        resolveNotificationSubscriptions(studioId, userIds),
        resolveNotificationPreferencesForUsers(userIds),
        resolveExistingNotificationDeliveries(
            activeSignals.map((signal) => signal.id),
            userIds,
        ),
    ]);

    const preferenceMap = new Map(preferenceRows.map((row) => [row.user_id, mapNotificationPreferences(row)]));
    const subscriptionMap = new Map(subscriptionRows.map((row) => [`${row.user_id}:${row.domain}`, row]));
    const existingKeys = new Set(existingDeliveries.map((delivery) => `${delivery.signal_id}:${delivery.user_id}`));

    const deliveryPayloads = activeSignals.flatMap((signal) =>
        memberships.flatMap((membership) => {
            const preferences = preferenceMap.get(membership.user_id) ?? createDefaultNotificationPreferences();
            const audience = deriveNotificationAudience({
                domain: signal.domain,
                role: membership.role,
                active: membership.status === "active",
                canUsePrioritySupport: signal.domain === "support" ? membership.role === "owner" || membership.role === "admin" : false,
                canInviteSeats: membership.role === "owner" || membership.role === "admin",
            });
            const subscription = subscriptionMap.get(`${membership.user_id}:${signal.domain}`) ?? null;
            const decision = resolveNotificationDeliveryDecision({
                audience,
                inAppEnabled: preferences.inAppEnabled,
                subscriptionFollowing: subscription?.following ?? true,
            });
            const deliveryKey = `${signal.id}:${membership.user_id}`;

            if (!decision.deliver || existingKeys.has(deliveryKey)) {
                return [];
            }

            return [
                {
                    signal_id: signal.id,
                    user_id: membership.user_id,
                    state: "pending" as const,
                    delivery_reason: decision.reason,
                },
            ];
        }),
    );

    await insertNotificationDeliveries(deliveryPayloads);
}
