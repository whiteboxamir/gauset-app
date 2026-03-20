import { notFound } from "next/navigation";

import { AdminCreditGrantPanel } from "@/components/admin/AdminCreditGrantPanel";
import { AdminNotesPanel } from "@/components/admin/AdminNotesPanel";
import { AdminSupportQueueList } from "@/components/admin/AdminSupportQueueList";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatCurrencyCents, formatDateTime } from "@/components/platform/formatters";
import { requireAdminSession } from "@/server/admin/access";
import { getAdminStudioDetail } from "@/server/admin/service";

export default async function AdminStudioDetailPage({
    params,
}: {
    params: Promise<{ studioId: string }>;
}) {
    await requireAdminSession("/admin/accounts");
    const { studioId } = await params;
    const detail = await getAdminStudioDetail(studioId);

    if (!detail || !detail.account) {
        notFound();
    }
    const provisioningFull = detail.activation.availableSeatCount !== null && detail.activation.availableSeatCount <= 0;

    return (
        <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Studio account</p>
                        <h1 className="mt-2 text-3xl font-medium tracking-tight text-white">{detail.account.studioName}</h1>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">
                            {detail.account.planCode ?? "No plan"} · {detail.account.seatsUsed}
                            {detail.account.seatsLimit ? ` / ${detail.account.seatsLimit}` : ""} provisioned seats · {detail.account.pendingInvitations} pending invites
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {detail.account.subscriptionStatus ? <StatusBadge label={detail.account.subscriptionStatus} tone="info" /> : null}
                        {detail.account.prioritySupportEnabled ? <StatusBadge label="Priority support" tone="success" /> : null}
                        {detail.account.mvpAccessEnabled ? <StatusBadge label="MVP access" tone="success" /> : <StatusBadge label="MVP blocked" tone="warning" />}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-4">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Credit balance</p>
                    <p className="mt-3 text-lg text-white">{detail.account.creditBalance ?? 0}</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Open support</p>
                    <p className="mt-3 text-lg text-white">{detail.account.openSupportThreads}</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Delinquent invoices</p>
                    <p className="mt-3 text-lg text-white">{detail.account.delinquentInvoiceCount}</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Latest invoice</p>
                    <p className="mt-3 text-lg text-white">{detail.account.latestInvoiceStatus ?? "None"}</p>
                </article>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Provisioned seat posture</p>
                    <p className="mt-3 text-lg text-white">
                        {detail.activation.projectedSeatCount}
                        {detail.activation.provisionedSeatCount ? ` / ${detail.activation.provisionedSeatCount}` : ""}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                        {detail.activation.provisionedSeatCount === null
                            ? "No explicit provisioned seat count is recorded yet."
                            : provisioningFull
                              ? "Active members plus pending invites already fill the current provisioning."
                              : `${detail.activation.availableSeatCount} seats remain before the current provisioning fills.`}
                    </p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Plan ceiling</p>
                    <p className="mt-3 text-lg text-white">{detail.activation.planSeatLimit ?? "Custom"}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                        {detail.activation.planSeatLimit === null
                            ? "The current plan does not expose a hard seat ceiling here."
                            : detail.activation.provisionedSeatCount !== null && detail.activation.planSeatLimit > detail.activation.provisionedSeatCount
                              ? `${detail.activation.planSeatLimit - detail.activation.provisionedSeatCount} more seats can still be provisioned on the plan.`
                              : "The studio is already provisioned up to the recorded plan ceiling."}
                    </p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Activation truth</p>
                    <p className="mt-3 text-lg text-white">{provisioningFull ? "Needs provisioning work" : "DB-backed account state"}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                        This studio detail reflects stored billing, seat, and support state only. It does not claim live auth or billing certification by itself.
                    </p>
                </article>
            </section>

            <div className="grid gap-6 xl:grid-cols-[0.85fr,1.15fr]">
                <AdminCreditGrantPanel studioId={studioId} />
                <AdminNotesPanel studioId={studioId} notes={detail.notes} />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Recent invoices</p>
                    <div className="mt-5 space-y-3">
                        {detail.recentInvoices.map((invoice) => (
                            <article key={invoice.invoiceId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge label={invoice.status} tone={invoice.status === "paid" ? "success" : "warning"} />
                                        <p className="text-sm text-neutral-300">{formatCurrencyCents(invoice.totalCents, invoice.currency)}</p>
                                    </div>
                                    <p className="text-xs text-neutral-500">{formatDateTime(invoice.dueAt ?? invoice.paidAt)}</p>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Recent audit</p>
                    <div className="mt-5 space-y-3">
                        {detail.recentAuditEvents.map((event) => (
                            <article key={event.eventId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                <p className="text-sm font-medium text-white">{event.summary}</p>
                                <p className="mt-1 text-xs uppercase tracking-[0.18em] text-neutral-500">{event.eventType}</p>
                                <p className="mt-2 text-xs text-neutral-500">{formatDateTime(event.createdAt)}</p>
                            </article>
                        ))}
                    </div>
                </section>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Recent payments</p>
                            <h3 className="mt-2 text-lg font-medium text-white">Settlement history</h3>
                        </div>
                        <StatusBadge label={`${detail.recentPayments.length} payments`} tone="info" />
                    </div>

                    {detail.recentPayments.length === 0 ? (
                        <EmptyState eyebrow="Payments" title="No recent payments" body="Payment history will appear here once settlements are recorded for this studio." />
                    ) : (
                        <div className="mt-5 space-y-3">
                            {detail.recentPayments.map((payment) => (
                                <article key={payment.paymentId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusBadge label={payment.status} tone={payment.status === "succeeded" ? "success" : payment.status === "failed" ? "danger" : "warning"} />
                                            <p className="text-sm text-neutral-300">{formatCurrencyCents(payment.amountCents, payment.currency)}</p>
                                        </div>
                                        <p className="text-xs text-neutral-500">{formatDateTime(payment.paidAt)}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Overrides and flags</p>
                            <h3 className="mt-2 text-lg font-medium text-white">Launch posture applied to this studio</h3>
                        </div>
                        <StatusBadge label={`${detail.featureFlags.length + detail.accountFlags.length} active records`} tone="info" />
                    </div>

                    {detail.featureFlags.length === 0 && detail.accountFlags.length === 0 ? (
                        <EmptyState
                            eyebrow="Overrides"
                            title="No internal overrides"
                            body="Feature flags and account-level overrides will appear here when this studio is being held on a non-default operating posture."
                        />
                    ) : (
                        <div className="mt-5 space-y-3">
                            {detail.featureFlags.map((flag) => (
                                <article key={flag.assignmentId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusBadge label={flag.flagKey} tone="info" />
                                            <StatusBadge label={flag.scopeType} tone="neutral" />
                                            <StatusBadge label={flag.enabled ? "enabled" : "disabled"} tone={flag.enabled ? "success" : "warning"} />
                                        </div>
                                        <p className="text-xs text-neutral-500">{formatDateTime(flag.createdAt)}</p>
                                    </div>
                                    {Object.keys(flag.config).length > 0 ? (
                                        <p className="mt-3 break-all text-sm leading-6 text-neutral-400">{JSON.stringify(flag.config)}</p>
                                    ) : (
                                        <p className="mt-3 text-sm leading-6 text-neutral-500">No extra config attached.</p>
                                    )}
                                </article>
                            ))}

                            {detail.accountFlags.map((flag) => (
                                <article key={flag.assignmentId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusBadge label={flag.flagKey} tone="warning" />
                                            {flag.expiresAt ? <StatusBadge label="expires" tone="neutral" /> : null}
                                        </div>
                                        <p className="text-xs text-neutral-500">{formatDateTime(flag.createdAt)}</p>
                                    </div>
                                    <p className="mt-3 break-all text-sm leading-6 text-neutral-300">{JSON.stringify(flag.flagValue)}</p>
                                    <p className="mt-2 text-sm leading-6 text-neutral-500">{flag.reason ?? "No operator reason recorded."}</p>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            <AdminSupportQueueList threads={detail.supportThreads} title="Studio support threads" />
        </div>
    );
}
