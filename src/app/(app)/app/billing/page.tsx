import { BillingActions } from "@/components/billing/BillingActions";
import { EmptyState } from "@/components/platform/EmptyState";
import { GovernanceStrip } from "@/components/platform/GovernanceStrip";
import { CoverageSurfacePanel } from "@/components/platform/CoverageSurfacePanel";
import { ContinuitySurfacePanel } from "@/components/platform/ContinuitySurfacePanel";
import { AccessReasonPanel } from "@/components/platform/AccessReasonPanel";
import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { OperationalAttentionStrip } from "@/components/platform/OperationalAttentionStrip";
import { StudioBootstrapPanel } from "@/components/platform/StudioBootstrapPanel";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { requireAuthSession } from "@/server/auth/guards";
import { getBillingOverviewForSession } from "@/server/billing/summary";
import { deriveMvpAccessPosture } from "@/server/billing/surface";
import { resolveMvpAccessMode } from "@/server/mvp/access-gate";
import { canSessionAccessMvp } from "@/server/mvp/access";
import { getPlatformOpsSurfaceForSession } from "@/server/platform/surface-ops";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

function formatMoney(amountCents: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
    }).format(amountCents / 100);
}

function formatDate(value?: string | null) {
    if (!value) {
        return null;
    }

    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(value));
}

function formatCreditAmount(amount: number) {
    return `${amount > 0 ? "+" : ""}${amount}`;
}

function formatLedgerEntryLabel(entryType: string) {
    switch (entryType) {
        case "grant":
            return "Billing grant";
        case "usage":
            return "Usage debit";
        case "refund":
            return "Refund credit";
        case "reversal":
            return "Grant reversal";
        case "adjustment":
            return "Manual adjustment";
        default:
            return entryType.replaceAll("_", " ");
    }
}

function formatStatusLabel(value: string) {
    return value
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function statusToneForInvoice(status: string | null): BadgeTone {
    switch (status) {
        case "paid":
            return "success";
        case "open":
        case "draft":
            return "warning";
        case "void":
        case "uncollectible":
            return "neutral";
        default:
            return "neutral";
    }
}

function statusToneForPayment(status: string | null): BadgeTone {
    switch (status) {
        case "succeeded":
        case "refunded":
            return "success";
        case "failed":
            return "danger";
        case "pending":
            return "warning";
        default:
            return "neutral";
    }
}

function statusToneForSubscription(status: string | null): BadgeTone {
    switch (status) {
        case "active":
        case "trialing":
            return "success";
        case "past_due":
        case "unpaid":
        case "incomplete":
            return "warning";
        case "canceled":
        case "paused":
            return "neutral";
        default:
            return "neutral";
    }
}

function statusToneForRefund(status: string | null): BadgeTone {
    switch (status) {
        case "succeeded":
            return "success";
        case "failed":
            return "danger";
        case "pending":
        case "requires_action":
            return "warning";
        default:
            return "neutral";
    }
}

export default async function PlatformBillingPage({
    searchParams,
}: {
    searchParams: Promise<{ checkout?: string }>;
}) {
    const params = await searchParams;
    const session = await requireAuthSession("/app/billing");
    if (!session.activeStudioId) {
        return (
            <StudioBootstrapPanel
                eyebrow="Billing"
                title="Create a workspace before touching billing"
                body="Billing is scoped to a studio workspace so plans, invoices, credits, and portal state all attach to one operating surface. Creating the first workspace here unlocks the live billing control center."
            />
        );
    }

    const [overview, surface, effectiveMvpAccess] = await Promise.all([
        getBillingOverviewForSession(session),
        getPlatformOpsSurfaceForSession(session, {
            governance: true,
            notificationSubscriptions: true,
            accessReasons: true,
            continuity: true,
        }),
        canSessionAccessMvp(session),
    ]);
    const { coordinationSnapshot, governanceSnapshot, notificationSubscriptions, accessReasons, continuitySnapshot } = surface;
    if (!coordinationSnapshot || !governanceSnapshot || !continuitySnapshot) {
        return null;
    }

    const { summary } = overview;
    const mvpAccessMode = resolveMvpAccessMode();
    const mvpAccessPosture = deriveMvpAccessPosture({
        gateEnabled: mvpAccessMode.gateEnabled,
        misconfigured: mvpAccessMode.misconfigured,
        anonymousAllowed: mvpAccessMode.anonymousAllowed,
        effectiveAccess: effectiveMvpAccess,
        planAccess: summary.entitlements.canAccessMvp,
    });
    const latestPayment = summary.recentPayments[0] ?? null;
    const latestRefund = summary.recentRefunds[0] ?? null;
    const outstandingInvoice = summary.recentInvoices.find((invoice) => invoice.amountRemainingCents > 0) ?? null;
    const latestLedgerBalance =
        summary.creditLedger.find((entry) => entry.balanceAfter !== null)?.balanceAfter ?? summary.entitlements.monthlyCreditsRemaining;
    const designPartnerPlan = overview.availablePlans.find((plan) => plan.isDesignPartner) ?? null;
    const billingItems = [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter(
        (item) => item.domain === "billing" || item.domain === "workspace",
    );

    const contractLabel = overview.stripeConfigured
        ? summary.plan?.billingProvider === "manual"
            ? "Manual provisioning"
            : "Stripe sessions enabled"
        : "Stripe not configured";
    const contractBody = !overview.stripeConfigured
        ? "This environment can read billing state but cannot claim live checkout, portal, or webhook certification."
        : summary.plan?.billingProvider === "manual"
          ? "This workspace is on a manual design-partner plan. Self-serve checkout is available for Stripe plans, but current entitlements stay managed by Gauset unless the workspace is migrated."
          : overview.portalReady
            ? "Checkout and portal can launch real Stripe sessions for this studio. Local entitlement and invoice state still settle through Stripe webhooks."
            : "Checkout is available, but the Stripe portal remains blocked until a Stripe customer is attached to this studio.";
    const financeLabel = outstandingInvoice
        ? "Collection follow-up required"
        : latestPayment?.status === "failed"
          ? "Payment issue detected"
          : summary.latestInvoice
            ? "Billing ledger synced"
            : "Awaiting first invoice";
    const financeTone: BadgeTone = outstandingInvoice
        ? "warning"
        : latestPayment?.status === "failed"
          ? "danger"
          : summary.latestInvoice
            ? "success"
            : "neutral";
    const financeBody = outstandingInvoice
        ? `Outstanding balance ${formatMoney(outstandingInvoice.amountRemainingCents, outstandingInvoice.currency)}${
              outstandingInvoice.dueAt ? ` due ${formatDate(outstandingInvoice.dueAt)}` : ""
          }.`
        : latestPayment
          ? `Latest payment ${formatStatusLabel(latestPayment.status)}${
                latestPayment.paidAt ? ` on ${formatDate(latestPayment.paidAt)}` : ""
            }.`
          : "No payment settlement has been synchronized yet.";

    return (
        <div className="space-y-6">
            {params.checkout === "success" ? (
                <p className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
                    Checkout returned successfully. Local plan, invoice, and entitlement state update only after Stripe webhook sync. This banner is not live webhook certification.
                </p>
            ) : null}
            {params.checkout === "canceled" ? (
                <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Checkout canceled. No billing state was changed locally.
                </p>
            ) : null}
            {params.checkout === "required" ? (
                <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    The current runtime gate still sees this session as not entitled for `/mvp`. Upgrade, provision a design-partner plan, or grant an account override before routing users into the workspace.
                </p>
            ) : null}

            <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex flex-wrap items-start justify-between gap-6">
                    <div className="max-w-3xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Design-partner billing</p>
                        <h1 className="mt-3 text-3xl font-medium tracking-tight text-white">
                            {summary.plan?.name ?? "Premium billing and entitlement command surface"}
                        </h1>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">
                            Checkout, portal, invoices, payments, refunds, and credits are all rendered from real billing records. This surface is explicit about contract truth: redirects do not finalize entitlements, and webhook certification is not implied by UI availability alone.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={mvpAccessPosture.label} tone={mvpAccessPosture.tone} />
                        <StatusBadge
                            label={overview.stripeConfigured ? "Checkout enabled" : "Checkout blocked"}
                            tone={overview.stripeConfigured ? "success" : "warning"}
                        />
                        <StatusBadge label={overview.portalReady ? "Portal enabled" : "Portal blocked"} tone={overview.portalReady ? "info" : "neutral"} />
                        <StatusBadge
                            label={summary.subscription?.status ? formatStatusLabel(summary.subscription.status) : "No active subscription"}
                            tone={statusToneForSubscription(summary.subscription?.status ?? null)}
                        />
                    </div>
                </div>

                <div className="mt-8 grid gap-4 xl:grid-cols-4">
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Recorded plan</p>
                        <p className="mt-3 text-xl text-white">{summary.plan?.name ?? "No active paid plan"}</p>
                        <p className="mt-1 text-sm text-neutral-500">
                            {summary.plan ? `${formatStatusLabel(summary.subscription?.status ?? "manual")}` : designPartnerPlan ? "Invite-only partner plan available" : "Manual or inactive"}
                        </p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Effective MVP access</p>
                        <p className="mt-3 text-xl text-white">{mvpAccessPosture.label}</p>
                        <p className="mt-1 text-sm text-neutral-500">{mvpAccessPosture.description}</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Seat capacity</p>
                        <p className="mt-3 text-xl text-white">
                            {summary.entitlements.seatsUsed}
                            {summary.entitlements.seatLimit ? ` / ${summary.entitlements.seatLimit}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">Derived from active studio memberships.</p>
                    </article>
                    <article className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Credits remaining</p>
                        <p className="mt-3 text-xl text-white">
                            {summary.entitlements.monthlyCreditsRemaining ?? "n/a"}
                            {summary.entitlements.monthlyCreditsIncluded ? ` / ${summary.entitlements.monthlyCreditsIncluded}` : ""}
                        </p>
                        <p className="mt-1 text-sm text-neutral-500">
                            {latestLedgerBalance !== null ? `Latest ledger balance ${latestLedgerBalance}.` : "Awaiting ledger activity."}
                        </p>
                    </article>
                </div>

                <div className="mt-8 grid gap-4 xl:grid-cols-3">
                    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-medium text-white">Entitlement truth</h2>
                            <StatusBadge label={mvpAccessPosture.label} tone={mvpAccessPosture.tone} />
                        </div>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">{mvpAccessPosture.description}</p>
                        <div className="mt-4 space-y-2 text-sm text-neutral-400">
                            <p>Plan includes MVP access: {summary.entitlements.canAccessMvp ? "Yes" : "No"}</p>
                            <p>Seat invites: {summary.entitlements.canInviteSeats ? "Allowed" : "Blocked"}</p>
                            <p>Priority support: {summary.entitlements.canUsePrioritySupport ? "Included" : "Standard"}</p>
                            <p>Admin console: {summary.entitlements.canUseAdminConsole ? "Included" : "Not included"}</p>
                        </div>
                    </article>

                    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-medium text-white">Contract truth</h2>
                            <StatusBadge label={contractLabel} tone={overview.stripeConfigured ? "info" : "warning"} />
                        </div>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">{contractBody}</p>
                        <div className="mt-4 space-y-2 text-sm text-neutral-400">
                            <p>Checkout: {overview.stripeConfigured ? "Can request real Stripe sessions" : "Disabled in this environment"}</p>
                            <p>Portal: {overview.portalReady ? "Can open the studio Stripe portal" : "Blocked until a Stripe customer is attached"}</p>
                            <p>Webhook sync: Entitlements, invoices, and credits settle after Stripe event delivery. This page does not claim live Stripe certification.</p>
                        </div>
                    </article>

                    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-medium text-white">Revenue posture</h2>
                            <StatusBadge label={financeLabel} tone={financeTone} />
                        </div>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">{financeBody}</p>
                        <div className="mt-4 space-y-2 text-sm text-neutral-400">
                            <p>
                                Latest invoice:{" "}
                                {summary.latestInvoice
                                    ? `${formatMoney(summary.latestInvoice.totalCents, summary.latestInvoice.currency)} · ${formatStatusLabel(summary.latestInvoice.status)}`
                                    : "No invoice synchronized yet"}
                            </p>
                            <p>
                                Latest payment:{" "}
                                {latestPayment
                                    ? `${formatStatusLabel(latestPayment.status)}${latestPayment.paidAt ? ` · ${formatDate(latestPayment.paidAt)}` : ""}`
                                    : "No payment synchronized yet"}
                            </p>
                            <p>
                                Latest refund:{" "}
                                {latestRefund
                                    ? `${formatMoney(latestRefund.amountCents, latestRefund.currency)} · ${formatStatusLabel(latestRefund.status)}`
                                    : "No refund synchronized yet"}
                            </p>
                        </div>
                    </article>
                </div>

                <div className="mt-8">
                    <BillingActions
                        availablePlans={overview.availablePlans}
                        currentPlanCode={summary.plan?.code ?? null}
                        currentSubscriptionStatus={summary.subscription?.status ?? null}
                        portalReady={overview.portalReady}
                        stripeConfigured={overview.stripeConfigured}
                        approvalCount={governanceSnapshot.pendingRequests.filter((request) => request.requestType === "billing_checkout").length}
                    />
                </div>
            </section>

            <GovernanceStrip
                eyebrow="Billing governance"
                title="Billing approvals and policy state"
                items={governanceSnapshot.items.filter((item) => item.domain === "billing" || item.domain === "workspace")}
                emptyBody="Billing actions and workspace governance policy are aligned right now."
            />

            <OperationalAttentionStrip
                eyebrow="Billing operations"
                title="Billing actions"
                items={[...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter(
                    (item) => item.domain === "billing" || item.domain === "workspace",
                )}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                coverage={coordinationSnapshot.coverage}
                emptyBody="The shared operations model has no open billing or workspace-contact blockers right now."
            />

            <CoverageSurfacePanel
                eyebrow="Billing coverage"
                title="Billing owner availability and escalation posture"
                domains={["billing", "workspace"]}
                items={billingItems}
                coverage={coordinationSnapshot.coverage}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                emptyBody="Billing and workspace-contact coverage are aligned with current capacity policy."
            />
            <ContinuitySurfacePanel
                snapshot={continuitySnapshot}
                domains={["billing", "workspace"]}
                eyebrow="Billing continuity"
                title="Billing and workspace-contact handoffs"
                emptyBody="No billing continuity handoff has been recorded yet."
            />

            <LaneSubscriptionPanel
                title="Follow or mute billing-routed signals"
                subtitle="Billing follows control whether invoices, subscription posture, and workspace-contact issues become persistent in-app deliveries."
                subscriptions={notificationSubscriptions}
                domains={["billing", "workspace"]}
                compact
            />

            <AccessReasonPanel
                accessReasons={accessReasons}
                visibleKeys={["billing_actions", "priority_support"]}
                title="Why billing actions are granted or blocked"
                compact
            />

            <section className="grid gap-6 xl:grid-cols-3">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-medium text-white">Invoices</h3>
                        <StatusBadge label={`${summary.recentInvoices.length}`} tone="neutral" />
                    </div>
                    {summary.recentInvoices.length === 0 ? (
                        <p className="mt-4 text-sm text-neutral-500">No invoices have been synchronized yet.</p>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {summary.recentInvoices.map((invoice) => (
                                <div key={invoice.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium text-white">{invoice.number ?? invoice.id.slice(0, 8)}</p>
                                                <StatusBadge label={formatStatusLabel(invoice.status)} tone={statusToneForInvoice(invoice.status)} />
                                            </div>
                                            <p className="mt-1 text-xs text-neutral-500">
                                                {invoice.issuedAt ? `Issued ${formatDate(invoice.issuedAt)}` : "Awaiting issue date"}
                                            </p>
                                            {invoice.amountRemainingCents > 0 ? (
                                                <p className="mt-2 text-sm text-neutral-400">
                                                    Outstanding {formatMoney(invoice.amountRemainingCents, invoice.currency)}
                                                    {invoice.dueAt ? ` · due ${formatDate(invoice.dueAt)}` : ""}
                                                </p>
                                            ) : null}
                                            {invoice.hostedInvoiceUrl ? (
                                                <a
                                                    href={invoice.hostedInvoiceUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="mt-2 inline-flex text-xs font-medium text-cyan-200 transition hover:text-cyan-100"
                                                >
                                                    Open hosted invoice
                                                </a>
                                            ) : null}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-white">{formatMoney(invoice.totalCents, invoice.currency)}</p>
                                            <p className="mt-1 text-xs text-neutral-500">
                                                {invoice.paidAt ? `Paid ${formatDate(invoice.paidAt)}` : "Awaiting payment"}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>

                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-medium text-white">Payments</h3>
                        <StatusBadge label={`${summary.recentPayments.length}`} tone="neutral" />
                    </div>
                    {summary.recentPayments.length === 0 ? (
                        <p className="mt-4 text-sm text-neutral-500">No payments have been synchronized yet.</p>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {summary.recentPayments.map((payment) => (
                                <div key={payment.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium text-white">
                                                    {payment.paymentMethodBrand
                                                        ? `${payment.paymentMethodBrand.toUpperCase()} •••• ${payment.paymentMethodLast4 ?? "----"}`
                                                        : payment.id.slice(0, 8)}
                                                </p>
                                                <StatusBadge label={formatStatusLabel(payment.status)} tone={statusToneForPayment(payment.status)} />
                                            </div>
                                            <p className="mt-1 text-xs text-neutral-500">
                                                {payment.paidAt ? `Updated ${formatDate(payment.paidAt)}` : "Awaiting payment timestamp"}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-white">{formatMoney(payment.amountCents, payment.currency)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>

                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-medium text-white">Refunds</h3>
                        <StatusBadge label={`${summary.recentRefunds.length}`} tone="neutral" />
                    </div>
                    {summary.recentRefunds.length === 0 ? (
                        <p className="mt-4 text-sm text-neutral-500">No refunds have been synchronized yet.</p>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {summary.recentRefunds.map((refund) => (
                                <div key={refund.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium text-white">{refund.providerRefundId ?? refund.id.slice(0, 8)}</p>
                                                <StatusBadge label={formatStatusLabel(refund.status)} tone={statusToneForRefund(refund.status)} />
                                            </div>
                                            <p className="mt-1 text-xs text-neutral-500">
                                                {refund.refundedAt ? `Updated ${formatDate(refund.refundedAt)}` : "Awaiting refund timestamp"}
                                            </p>
                                            {refund.reason ? <p className="mt-2 text-sm text-neutral-400">{refund.reason}</p> : null}
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-medium text-white">{formatMoney(refund.amountCents, refund.currency)}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </article>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-medium text-white">Credit ledger</h3>
                    <StatusBadge label={`${summary.creditLedger.length}`} tone="neutral" />
                </div>
                {summary.creditLedger.length === 0 ? (
                    <EmptyState
                        className="mt-4"
                        eyebrow="Ledger"
                        title="No ledger activity synchronized"
                        body="Billing grants, usage debits, refund restorations, grant reversals, and admin adjustments land here once the shared ledger sees activity."
                    />
                ) : (
                    <div className="mt-4 space-y-3">
                        {summary.creditLedger.map((entry) => (
                            <div key={entry.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-medium text-white">{formatLedgerEntryLabel(entry.entryType)}</p>
                                            <StatusBadge label={entry.entryType.replaceAll("_", " ")} tone={entry.amount >= 0 ? "success" : "warning"} />
                                        </div>
                                        <p className="mt-1 text-xs text-neutral-500">{formatDate(entry.createdAt) ?? entry.createdAt}</p>
                                        {entry.note ? <p className="mt-2 text-sm text-neutral-400">{entry.note}</p> : null}
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium text-white">{formatCreditAmount(entry.amount)}</p>
                                        <p className="mt-1 text-xs text-neutral-500">
                                            {entry.balanceAfter !== null ? `Balance ${entry.balanceAfter}` : "No running balance"}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}
