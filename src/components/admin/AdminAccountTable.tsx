import Link from "next/link";

import type { AdminAccountSummary } from "@/server/contracts/admin";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";

export function AdminAccountTable({
    accounts,
    title = "Account health",
}: {
    accounts: AdminAccountSummary[];
    title?: string;
}) {
    if (accounts.length === 0) {
        return <EmptyState eyebrow="Accounts" title={title} body="No studio accounts are available yet in the platform database." />;
    }

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Accounts</p>
                <h3 className="mt-2 text-lg font-medium text-white">{title}</h3>
            </div>

            <div className="mt-5 space-y-3">
                {accounts.map((account) => (
                    (() => {
                        const projectedSeatCount = account.seatsUsed + account.pendingInvitations;
                        const provisioningFull = account.seatsLimit !== null && projectedSeatCount >= account.seatsLimit;

                        return (
                            <Link
                                key={account.studioId}
                                href={`/admin/accounts/${account.studioId}`}
                                className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                            >
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                        <p className="text-sm font-medium text-white">{account.studioName}</p>
                                        <p className="mt-1 text-sm text-neutral-500">
                                            {account.planCode ?? "No plan"} · {account.seatsUsed}
                                            {account.seatsLimit ? ` / ${account.seatsLimit}` : ""} provisioned seats
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {account.subscriptionStatus ? <StatusBadge label={account.subscriptionStatus} tone="info" /> : null}
                                        {account.prioritySupportEnabled ? <StatusBadge label="Priority" tone="success" /> : null}
                                        {account.mvpAccessEnabled ? <StatusBadge label="MVP" tone="success" /> : <StatusBadge label="No MVP" tone="warning" />}
                                        {provisioningFull ? <StatusBadge label="Provisioning full" tone="warning" /> : null}
                                        {account.delinquentInvoiceCount > 0 ? <StatusBadge label="Billing attention" tone="warning" /> : null}
                                        {account.openSupportThreads > 0 ? <StatusBadge label="Support active" tone="warning" /> : null}
                                    </div>
                                </div>

                                <div className="mt-4 grid gap-3 text-xs text-neutral-500 sm:grid-cols-4">
                                    <div>
                                        <p className="uppercase tracking-[0.18em]">Support</p>
                                        <p className="mt-1 text-sm text-neutral-300">{account.openSupportThreads} open</p>
                                    </div>
                                    <div>
                                        <p className="uppercase tracking-[0.18em]">Invoices</p>
                                        <p className="mt-1 text-sm text-neutral-300">{account.delinquentInvoiceCount} delinquent</p>
                                    </div>
                                    <div>
                                        <p className="uppercase tracking-[0.18em]">Invites</p>
                                        <p className="mt-1 text-sm text-neutral-300">{account.pendingInvitations} pending</p>
                                    </div>
                                    <div>
                                        <p className="uppercase tracking-[0.18em]">Credits</p>
                                        <p className="mt-1 text-sm text-neutral-300">{account.creditBalance ?? 0}</p>
                                    </div>
                                </div>
                            </Link>
                        );
                    })()
                ))}
            </div>
        </section>
    );
}
