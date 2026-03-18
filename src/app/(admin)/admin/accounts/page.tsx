import Link from "next/link";

import { AdminAccountTable } from "@/components/admin/AdminAccountTable";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatCurrencyCents, formatDateTime } from "@/components/platform/formatters";
import { requireAdminSession } from "@/server/admin/access";
import { getAdminOperationsSnapshot } from "@/server/admin/service";

export default async function AdminAccountsPage() {
    await requireAdminSession("/admin/accounts");
    const snapshot = await getAdminOperationsSnapshot();
    const openSupportCount = snapshot.supportQueue.filter((thread) => thread.status === "open" || thread.status === "pending").length;
    const urgentSupportCount = snapshot.supportQueue.filter(
        (thread) => thread.priority === "urgent" && (thread.status === "open" || thread.status === "pending"),
    ).length;

    return (
        <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Admin operations</p>
                        <h1 className="mt-2 text-3xl font-medium tracking-tight text-white">Account health, queue pressure, and internal overrides</h1>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">
                            This console reports stored platform state for support, billing, and workspace posture. It is intentionally truthful about what is backed by database state and does not imply full staging certification by itself.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label="Internal only" tone="warning" />
                        <StatusBadge label={`${openSupportCount} active support`} tone={openSupportCount > 0 ? "warning" : "success"} />
                        <StatusBadge label={`${snapshot.billingAlerts.length} billing alerts`} tone={snapshot.billingAlerts.length > 0 ? "warning" : "neutral"} />
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-4">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Studios</p>
                    <p className="mt-3 text-lg text-white">{snapshot.accounts.length}</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Support queue</p>
                    <p className="mt-3 text-lg text-white">{openSupportCount}</p>
                    <p className="mt-1 text-sm text-neutral-500">{urgentSupportCount} urgent threads currently need operator attention.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Billing alerts</p>
                    <p className="mt-3 text-lg text-white">{snapshot.billingAlerts.length}</p>
                    <p className="mt-1 text-sm text-neutral-500">Open and uncollectible invoices with remaining balance.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Console truth</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <StatusBadge label="DB-backed" tone="success" />
                        <StatusBadge label="No live-cert claim" tone="warning" />
                    </div>
                </article>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                <AdminAccountTable accounts={snapshot.accounts} />

                <div className="space-y-6">
                    <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Billing alerts</p>
                                <h3 className="mt-2 text-lg font-medium text-white">Collections watchlist</h3>
                            </div>
                            <StatusBadge label={`${snapshot.billingAlerts.length} alerts`} tone={snapshot.billingAlerts.length > 0 ? "warning" : "success"} />
                        </div>

                        {snapshot.billingAlerts.length === 0 ? (
                            <p className="mt-5 text-sm leading-7 text-neutral-400">No outstanding billing alerts are visible from the current invoice ledger.</p>
                        ) : (
                            <div className="mt-5 space-y-3">
                                {snapshot.billingAlerts.slice(0, 5).map((alert) => (
                                    <article key={alert.invoiceId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-white">{alert.studioName}</p>
                                                <p className="mt-1 text-sm text-neutral-500">{formatCurrencyCents(alert.amountRemainingCents, alert.currency)} remaining</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <StatusBadge label={alert.invoiceStatus} tone="warning" />
                                                {alert.dueAt ? <StatusBadge label={formatDateTime(alert.dueAt)} tone="neutral" /> : null}
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Queue preview</p>
                                <h3 className="mt-2 text-lg font-medium text-white">Support threads needing action</h3>
                            </div>
                            <StatusBadge label={`${openSupportCount} active`} tone={openSupportCount > 0 ? "warning" : "success"} />
                        </div>

                        {snapshot.supportQueue.length === 0 ? (
                            <p className="mt-5 text-sm leading-7 text-neutral-400">No queued support threads are visible right now.</p>
                        ) : (
                            <div className="mt-5 space-y-3">
                                {snapshot.supportQueue.slice(0, 5).map((thread) => (
                                    <Link
                                        key={thread.threadId}
                                        href={`/admin/support/${thread.threadId}`}
                                        className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <p className="text-sm font-medium text-white">{thread.subject}</p>
                                                <p className="mt-1 text-sm text-neutral-500">{thread.studioName}</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <StatusBadge label={thread.priority} tone={thread.priority === "urgent" ? "warning" : "neutral"} />
                                                <StatusBadge label={thread.assignedAdminUserId ? "Assigned" : "Unassigned"} tone={thread.assignedAdminUserId ? "info" : "warning"} />
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
