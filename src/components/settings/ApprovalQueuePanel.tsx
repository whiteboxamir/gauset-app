"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { GovernanceApprovalRequest } from "@/server/contracts/governance";

import { EmptyState } from "@/components/platform/EmptyState";
import { formatDateTime } from "@/components/platform/formatters";
import { StatusBadge } from "@/components/platform/StatusBadge";

export function ApprovalQueuePanel({
    pendingRequests,
    recentRequests,
    canManage,
}: {
    pendingRequests: GovernanceApprovalRequest[];
    recentRequests: GovernanceApprovalRequest[];
    canManage: boolean;
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const runAction = (requestId: string, action: "approve" | "reject" | "cancel") => {
        setError(null);
        setMessage(null);

        startTransition(async () => {
            try {
                const response = await fetch("/api/account/governance/approvals", {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        requestId,
                        action,
                    }),
                });
                const payload = (await response.json()) as { success?: boolean; message?: string; redirectUrl?: string | null };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to update approval request.");
                }

                if (payload.redirectUrl) {
                    window.location.href = payload.redirectUrl;
                    return;
                }

                setMessage(action === "approve" ? "Request approved and executed." : action === "reject" ? "Request rejected." : "Request canceled.");
                router.refresh();
            } catch (approvalError) {
                setError(approvalError instanceof Error ? approvalError.message : "Unable to update approval request.");
            }
        });
    };

    return (
        <section id="approvals" className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Approval queue</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Pending and recent governance requests</h3>
                </div>
                <StatusBadge label={`${pendingRequests.length} pending`} tone={pendingRequests.length > 0 ? "warning" : "success"} />
            </div>

            {pendingRequests.length === 0 ? (
                <EmptyState
                    className="mt-5"
                    eyebrow="Pending requests"
                    title="No approval requests waiting"
                    body="Sensitive workspace mutations are currently flowing without a blocked governance queue."
                />
            ) : (
                <div className="mt-5 space-y-3">
                    {pendingRequests.map((request) => (
                        <article key={request.requestId} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusBadge label={request.requestType.replaceAll("_", " ")} tone="warning" />
                                        <StatusBadge label={formatDateTime(request.requestedAt)} tone="neutral" />
                                    </div>
                                    <p className="mt-3 text-sm font-medium text-white">{request.summary}</p>
                                    {request.detail ? <p className="mt-2 text-sm leading-6 text-neutral-400">{request.detail}</p> : null}
                                    <p className="mt-2 text-xs text-neutral-500">Requested by {request.requestedByLabel}</p>
                                </div>
                                {canManage ? (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => runAction(request.requestId, "approve")}
                                            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-neutral-200 disabled:opacity-60"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => runAction(request.requestId, "reject")}
                                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                        >
                                            Reject
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isPending}
                                            onClick={() => runAction(request.requestId, "cancel")}
                                            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-60"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ) : null}
                            </div>
                        </article>
                    ))}
                </div>
            )}

            <div className="mt-8">
                <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-white">Recent decisions</h4>
                    <StatusBadge label={`${recentRequests.length}`} tone="neutral" />
                </div>
                {recentRequests.length === 0 ? (
                    <p className="mt-3 text-sm text-neutral-500">No recent approval history yet.</p>
                ) : (
                    <div className="mt-3 space-y-3">
                        {recentRequests.map((request) => (
                            <article key={request.requestId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium text-white">{request.summary}</p>
                                        <p className="mt-1 text-xs text-neutral-500">
                                            {request.status} · {request.decidedByLabel ?? request.requestedByLabel} · {formatDateTime(request.decidedAt ?? request.requestedAt)}
                                        </p>
                                    </div>
                                    <StatusBadge
                                        label={request.status}
                                        tone={request.status === "executed" ? "success" : request.status === "rejected" ? "danger" : "neutral"}
                                    />
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </div>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
