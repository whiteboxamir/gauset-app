"use client";

import { useEffect, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { CoverageSnapshot } from "@/server/contracts/coverage";
import type { CoordinationOperator, CoordinationViewer, CoordinatedOperationalItem } from "@/server/contracts/coordination";

import { describeCoverageStatus } from "@/components/platform/coverage-guidance";
import { formatDateTime } from "@/components/platform/formatters";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { describeProjectedLoad, getCapacityTone, getCoverageStatusTone } from "@/components/platform/coverage-presentation";

function getSeverityTone(severity: CoordinatedOperationalItem["severity"]) {
    switch (severity) {
        case "urgent":
            return "danger";
        case "watch":
            return "warning";
        case "resolved":
            return "success";
        default:
            return "neutral";
    }
}

function getStatusTone(status: CoordinatedOperationalItem["status"]) {
    switch (status) {
        case "in_progress":
            return "info";
        case "snoozed":
            return "warning";
        case "resolved":
            return "success";
        default:
            return "neutral";
    }
}

function getStateLabel(status: CoordinatedOperationalItem["status"]) {
    return status.replaceAll("_", " ");
}

function getClaimLabel({
    item,
    viewer,
}: {
    item: CoordinatedOperationalItem;
    viewer: CoordinationViewer;
}) {
    if (item.assignee?.userId === viewer.userId && item.status === "open") {
        return "Start work";
    }
    if (item.assignee?.active && item.assignee.userId !== viewer.userId && viewer.canManageAssignments) {
        return "Take over";
    }
    return "Claim";
}

function buildSnoozeOptions(maxSnoozeHours: number) {
    const candidates = [4, 12, 24, 48, 72, maxSnoozeHours];
    return Array.from(new Set(candidates.filter((value) => value <= maxSnoozeHours))).sort((left, right) => left - right);
}

export function CoordinationItemCard({
    item,
    viewer,
    operators,
    maxSnoozeHours,
    coverage,
    compact = false,
    showDomain = true,
}: {
    item: CoordinatedOperationalItem;
    viewer: CoordinationViewer;
    operators: CoordinationOperator[];
    maxSnoozeHours: number;
    coverage?: CoverageSnapshot;
    compact?: boolean;
    showDomain?: boolean;
}) {
    const router = useRouter();
    const [assigneeUserId, setAssigneeUserId] = useState(item.assignee?.active ? item.assignee.userId : "");
    const [snoozeHours, setSnoozeHours] = useState(() => String(buildSnoozeOptions(maxSnoozeHours)[0] ?? maxSnoozeHours));
    const [resolutionNote, setResolutionNote] = useState(item.status === "resolved" ? item.resolutionNote ?? "" : "");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setAssigneeUserId(item.assignee?.active ? item.assignee.userId : "");
        setSnoozeHours(String(buildSnoozeOptions(maxSnoozeHours)[0] ?? maxSnoozeHours));
        setResolutionNote(item.status === "resolved" ? item.resolutionNote ?? "" : "");
        setError(null);
    }, [item, maxSnoozeHours]);

    const canManageAssignments = viewer.canManageAssignments;
    const canOperate = canManageAssignments || !item.assignee || !item.assignee.active || item.assignee.userId === viewer.userId;
    const canClaim =
        item.isLive &&
        item.status !== "resolved" &&
        ((!item.assignee || !item.assignee.active || item.assignee.userId === viewer.userId) ? item.status === "open" : canManageAssignments);
    const canResolve = item.isLive && item.status !== "resolved" && canOperate;
    const canSnooze = item.isLive && item.status !== "resolved" && item.status !== "snoozed" && canOperate;
    const canUnsnooze = item.isLive && item.status === "snoozed" && canOperate;
    const canReopen = item.isLive && item.status === "resolved" && canOperate;
    const snoozeOptions = buildSnoozeOptions(maxSnoozeHours);
    const ownerOperator = item.assignee?.active ? operators.find((operator) => operator.userId === item.assignee?.userId) ?? null : null;
    const laneSummary = coverage?.lanes.find((lane) => lane.domain === item.domain) ?? null;
    const rebalanceCandidate = coverage?.rebalanceCandidates.find((candidate) => candidate.itemKey === item.itemKey) ?? null;
    const suggestedOperator = rebalanceCandidate?.suggestedAssignee
        ? operators.find((operator) => operator.userId === rebalanceCandidate.suggestedAssignee?.userId) ?? null
        : null;
    const selectedOperator = assigneeUserId ? operators.find((operator) => operator.userId === assigneeUserId) ?? null : null;
    const currentOwnerUserId = item.assignee?.active ? item.assignee.userId : null;
    const canApplySuggestion = Boolean(canManageAssignments && rebalanceCandidate?.suggestedAssignee && item.isLive);
    const ownerAvailabilityLabel = item.assignee
        ? ownerOperator
            ? ownerOperator.coverageStatus
            : item.assignee.active
              ? null
              : "inactive owner"
        : null;
    const suggestedProjectedLoad = suggestedOperator
        ? describeProjectedLoad({
              operator: suggestedOperator,
              item,
              currentOwnerUserId,
              nextOwnerUserId: suggestedOperator.userId,
          })
        : null;
    const currentOwnerProjectedLoad = ownerOperator
        ? describeProjectedLoad({
              operator: ownerOperator,
              item,
              currentOwnerUserId,
              nextOwnerUserId: suggestedOperator?.userId ?? null,
          })
        : null;
    const selectedProjectedLoad = selectedOperator
        ? describeProjectedLoad({
              operator: selectedOperator,
              item,
              currentOwnerUserId,
              nextOwnerUserId: selectedOperator.userId,
          })
        : null;
    const selectedOwnerProjectedLoad = ownerOperator
        ? describeProjectedLoad({
              operator: ownerOperator,
              item,
              currentOwnerUserId,
              nextOwnerUserId: selectedOperator?.userId ?? null,
          })
        : null;

    const runRequest = (url: string, payload?: Record<string, unknown>) => {
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(url, {
                    method: "PATCH",
                    headers: payload
                        ? {
                              "Content-Type": "application/json",
                          }
                        : undefined,
                    body: payload ? JSON.stringify(payload) : undefined,
                });
                const result = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Unable to update coordination item.");
                }

                router.refresh();
            } catch (actionError) {
                setError(actionError instanceof Error ? actionError.message : "Unable to update coordination item.");
            }
        });
    };

    const runAction = (payload: Record<string, unknown>) => runRequest(`/api/account/coordination/${encodeURIComponent(item.itemKey)}`, payload);

    return (
        <article className="rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={item.severity} tone={getSeverityTone(item.severity)} />
                    <StatusBadge label={getStateLabel(item.status)} tone={getStatusTone(item.status)} />
                    <StatusBadge label={item.ageLabel} tone="neutral" />
                    {showDomain ? <StatusBadge label={item.domain} tone="neutral" /> : null}
                    {!item.isLive ? <StatusBadge label="recently resolved" tone="success" /> : null}
                    {item.isLive && item.status === "resolved" ? <StatusBadge label="live condition persists" tone="warning" /> : null}
                    {ownerAvailabilityLabel && ownerAvailabilityLabel !== "inactive owner" ? (
                        <StatusBadge label={ownerAvailabilityLabel} tone={getCoverageStatusTone(ownerAvailabilityLabel)} />
                    ) : null}
                    {ownerOperator && ownerOperator.capacityState !== "balanced" ? (
                        <StatusBadge label={ownerOperator.capacityState} tone={getCapacityTone(ownerOperator.capacityState)} />
                    ) : null}
                    {ownerAvailabilityLabel === "inactive owner" ? <StatusBadge label="inactive owner" tone="warning" /> : null}
                    {laneSummary?.status === "undercovered" ? <StatusBadge label="lane gap" tone="warning" /> : null}
                </div>
                <Link href={item.href} className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                    Open surface
                </Link>
            </div>

            <p className="mt-3 text-sm font-medium text-white">{item.title}</p>
            <p className={`mt-2 text-sm leading-6 text-neutral-400 ${compact ? "" : "max-w-3xl"}`}>{item.summary}</p>
            <p className="mt-3 text-sm text-neutral-300">{item.remediation}</p>

            <div className={`mt-4 grid gap-3 text-xs text-neutral-500 ${compact ? "" : "sm:grid-cols-2"}`}>
                <p>
                    Owner <span className="text-neutral-300">{item.assignee ? item.assignee.label : "Unassigned"}</span>
                </p>
                {ownerAvailabilityLabel ? (
                    <p>
                        Availability <span className="text-neutral-300">{ownerAvailabilityLabel}</span>
                    </p>
                ) : null}
                {ownerOperator ? (
                    <p>
                        Load <span className="text-neutral-300">{`${ownerOperator.activeAssignmentCount}/${Math.max(ownerOperator.maxActiveItems, 1)} active`}</span>
                    </p>
                ) : null}
                <p>
                    Freshness <span className="text-neutral-300">{item.freshnessLabel}</span>
                </p>
                {laneSummary ? (
                    <p>
                        Lane <span className="text-neutral-300">{laneSummary.status === "undercovered" ? "Undercovered" : `${laneSummary.coveredOperatorCount} covered`}</span>
                    </p>
                ) : null}
                {item.snoozedUntil ? (
                    <p>
                        Snoozed until <span className="text-neutral-300">{formatDateTime(item.snoozedUntil)}</span>
                    </p>
                ) : null}
                {item.resolvedAt ? (
                    <p>
                        Resolved <span className="text-neutral-300">{formatDateTime(item.resolvedAt)}</span>
                        {item.resolvedBy ? <span className="text-neutral-300">{` by ${item.resolvedBy.label}`}</span> : null}
                    </p>
                ) : null}
            </div>

            {item.resolutionNote ? <p className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">{item.resolutionNote}</p> : null}
            {rebalanceCandidate ? (
                <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
                    <p>
                        {rebalanceCandidate.reason}
                        {rebalanceCandidate.suggestedAssignee ? ` Suggested assignee: ${rebalanceCandidate.suggestedAssignee.label}.` : ""}
                    </p>
                    {suggestedOperator && suggestedProjectedLoad ? (
                        <div className={`mt-3 grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
                            {ownerOperator && currentOwnerProjectedLoad ? (
                                <p className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-neutral-200">
                                    {ownerOperator.label} after move: {ownerOperator.activeAssignmentCount} to {currentOwnerProjectedLoad.nextActive} active
                                    {" · "}
                                    {ownerOperator.urgentAssignmentCount} to {currentOwnerProjectedLoad.nextUrgent} urgent
                                </p>
                            ) : null}
                            <p className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                                {suggestedOperator.label} after move: {suggestedOperator.activeAssignmentCount} to {suggestedProjectedLoad.nextActive} active
                                {" · "}
                                {suggestedOperator.urgentAssignmentCount} to {suggestedProjectedLoad.nextUrgent} urgent
                            </p>
                        </div>
                    ) : null}
                </div>
            ) : null}

            {(canClaim || canResolve || canSnooze || canUnsnooze || canReopen || canManageAssignments) && item.isLive ? (
                <div className="mt-4 space-y-3 rounded-[1.2rem] border border-white/10 bg-black/20 p-3">
                    <div className="flex flex-wrap gap-2">
                        {canClaim ? (
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => runAction({ action: "claim" })}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                            >
                                {getClaimLabel({ item, viewer })}
                            </button>
                        ) : null}
                        {canSnooze ? (
                            <>
                                <select
                                    value={snoozeHours}
                                    onChange={(event) => setSnoozeHours(event.target.value)}
                                    disabled={isPending}
                                    className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                >
                                    {snoozeOptions.map((value) => (
                                        <option key={value} value={value} className="bg-neutral-950 text-white">
                                            {value}h
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() =>
                                        runAction({
                                            action: "snooze",
                                            snoozeHours: Number(snoozeHours),
                                        })
                                    }
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                >
                                    Snooze
                                </button>
                            </>
                        ) : null}
                        {canUnsnooze ? (
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => runAction({ action: "unsnooze" })}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                            >
                                Unsnooze
                            </button>
                        ) : null}
                        {canApplySuggestion ? (
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => runRequest(`/api/account/coverage/rebalance/${encodeURIComponent(item.itemKey)}`)}
                                className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-100 transition-colors hover:border-sky-300/30 hover:bg-sky-500/15 disabled:opacity-60"
                            >
                                Apply suggestion
                            </button>
                        ) : null}
                        {canReopen ? (
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() => runAction({ action: "reopen" })}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                            >
                                Reopen
                            </button>
                        ) : null}
                    </div>

                    {canResolve ? (
                        <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-[1fr,auto]"}`}>
                            <input
                                value={resolutionNote}
                                onChange={(event) => setResolutionNote(event.target.value)}
                                disabled={isPending}
                                maxLength={500}
                                placeholder="Resolution note (optional)"
                                className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40 disabled:text-neutral-500"
                            />
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={() =>
                                    runAction({
                                        action: "resolve",
                                        resolutionNote: resolutionNote.trim() || null,
                                    })
                                }
                                className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition-colors hover:border-emerald-300/30 hover:bg-emerald-500/15 disabled:opacity-60"
                            >
                                Resolve
                            </button>
                        </div>
                    ) : null}

                    {canManageAssignments ? (
                        <div className="space-y-3">
                            <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-[1fr,auto]"}`}>
                                <select
                                    value={assigneeUserId}
                                    onChange={(event) => setAssigneeUserId(event.target.value)}
                                    disabled={isPending}
                                    className="rounded-2xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                                >
                                    <option value="" className="bg-neutral-950 text-white">
                                        Unassigned
                                    </option>
                                    {operators.map((operator) => (
                                        <option key={operator.userId} value={operator.userId} className="bg-neutral-950 text-white">
                                            {`${operator.label} (${operator.coverageStatus} · ${operator.activeAssignmentCount}/${Math.max(operator.maxActiveItems, 1)})`}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    disabled={isPending || assigneeUserId === (item.assignee?.active ? item.assignee.userId : "")}
                                    onClick={() =>
                                        runAction({
                                            action: "assign",
                                            assigneeUserId: assigneeUserId || null,
                                        })
                                    }
                                    className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                >
                                    Save owner
                                </button>
                            </div>

                            {selectedOperator && selectedProjectedLoad ? (
                                <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
                                    <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 px-3 py-3 text-xs text-sky-100">
                                        <p className="font-medium text-white">{selectedOperator.label}</p>
                                        <p className="mt-1">
                                            {describeCoverageStatus(selectedOperator.coverageStatus)}
                                        </p>
                                        <p className="mt-2">
                                            After save: {selectedOperator.activeAssignmentCount} to {selectedProjectedLoad.nextActive} active ·{" "}
                                            {selectedOperator.urgentAssignmentCount} to {selectedProjectedLoad.nextUrgent} urgent
                                        </p>
                                    </div>
                                    {ownerOperator && selectedOwnerProjectedLoad && selectedOperator.userId !== ownerOperator.userId ? (
                                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-neutral-300">
                                            <p className="font-medium text-white">{ownerOperator.label}</p>
                                            <p className="mt-2">
                                                After save: {ownerOperator.activeAssignmentCount} to {selectedOwnerProjectedLoad.nextActive} active ·{" "}
                                                {ownerOperator.urgentAssignmentCount} to {selectedOwnerProjectedLoad.nextUrgent} urgent
                                            </p>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {error ? <p className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
        </article>
    );
}
