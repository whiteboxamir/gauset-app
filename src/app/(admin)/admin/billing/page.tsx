import Link from "next/link";

import { AdminAccountTable } from "@/components/admin/AdminAccountTable";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatCurrencyCents, formatDateTime } from "@/components/platform/formatters";
import { requireAdminSession } from "@/server/admin/access";
import { getAdminOperationsSnapshot } from "@/server/admin/service";

export default async function AdminBillingPage() {
    await requireAdminSession("/admin/billing");
    const snapshot = await getAdminOperationsSnapshot();

    return (
        <div className="space-y-6">
            {snapshot.billingAlerts.length === 0 ? (
                <EmptyState eyebrow="Billing" title="No billing alerts right now" body="Delinquent invoices and unpaid balances will appear here when accounts fall out of a healthy state." />
            ) : (
                <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Billing alerts</p>
                        <h3 className="mt-2 text-lg font-medium text-white">Open invoice exposure</h3>
                    </div>
                    <div className="mt-5 space-y-3">
                        {snapshot.billingAlerts.map((alert) => (
                            <Link
                                key={alert.invoiceId}
                                href={`/admin/accounts/${alert.studioId}`}
                                className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-medium text-white">{alert.studioName}</p>
                                        <p className="mt-1 text-sm text-neutral-500">{formatCurrencyCents(alert.amountRemainingCents, alert.currency)} remaining</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge label={alert.invoiceStatus} tone="warning" />
                                        <p className="text-xs text-neutral-500">Due {formatDateTime(alert.dueAt)}</p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            <AdminAccountTable
                accounts={[...snapshot.accounts].sort((left, right) => right.delinquentInvoiceCount - left.delinquentInvoiceCount || left.studioName.localeCompare(right.studioName))}
                title="Accounts by billing risk"
            />
        </div>
    );
}
