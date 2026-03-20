"use client";

import { useMemo, useState, useTransition } from "react";

import type { BillingPlanSummary } from "@/server/contracts/billing";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/platform/StatusBadge";

function formatMoney(amountCents: number, currency: string) {
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency.toUpperCase(),
    }).format(amountCents / 100);
}

function formatInterval(interval: BillingPlanSummary["interval"]) {
    if (interval === "custom") {
        return "invite only";
    }
    return interval;
}

export function BillingActions({
    availablePlans,
    currentPlanCode,
    currentSubscriptionStatus,
    portalReady,
    stripeConfigured,
    approvalCount,
}: {
    availablePlans: BillingPlanSummary[];
    currentPlanCode: string | null;
    currentSubscriptionStatus?: string | null;
    portalReady: boolean;
    stripeConfigured: boolean;
    approvalCount?: number;
}) {
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const currentPlan = useMemo(
        () => availablePlans.find((plan) => plan.code === currentPlanCode) ?? null,
        [availablePlans, currentPlanCode],
    );
    const manualPlans = useMemo(
        () => availablePlans.filter((plan) => plan.billingProvider === "manual" || plan.isDesignPartner),
        [availablePlans],
    );
    const stripePlans = useMemo(
        () => availablePlans.filter((plan) => plan.billingProvider === "stripe"),
        [availablePlans],
    );

    const openCheckout = (planCode: string) => {
        setError(null);
        setMessage(null);
        startTransition(async () => {
            try {
                const response = await fetch("/api/billing/checkout", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        planCode,
                    }),
                });
                const payload = (await response.json()) as {
                    code?: string;
                    url?: string;
                    message?: string;
                    approvalRequired?: boolean;
                    syncState?: string;
                };
                if (payload.approvalRequired) {
                    setMessage("Plan change queued for approval. Open governance to approve and launch checkout.");
                    return;
                }
                if (!response.ok || !payload.url) {
                    throw new Error(payload.message || "Unable to start checkout.");
                }
                window.location.href = payload.url;
            } catch (checkoutError) {
                setError(checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout.");
            }
        });
    };

    const openPortal = () => {
        setError(null);
        setMessage(null);
        startTransition(async () => {
            try {
                const response = await fetch("/api/billing/portal", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({}),
                });
                const payload = (await response.json()) as { code?: string; url?: string; message?: string };
                if (!response.ok || !payload.url) {
                    throw new Error(payload.message || "Unable to open billing portal.");
                }
                window.location.href = payload.url;
            } catch (portalError) {
                setError(portalError instanceof Error ? portalError.message : "Unable to open billing portal.");
            }
        });
    };

    const sessionTruth =
        !stripeConfigured
            ? "Stripe session creation is disabled in this environment. Recorded billing data remains visible, but checkout, portal, and live webhook proof are not implied."
            : portalReady
              ? "Checkout and portal create live Stripe sessions for this studio. Redirect success alone does not change local plan, invoice, or credit state."
              : currentPlan?.billingProvider === "manual"
                ? "This workspace is provisioned through a manual design-partner agreement. A Stripe portal only appears after a Stripe customer is explicitly attached."
                : "Self-serve checkout is enabled, but the portal stays blocked until the studio has a synced Stripe customer record.";

    return (
        <section className="space-y-5">
            {typeof approvalCount === "number" && approvalCount > 0 ? (
                <p className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {approvalCount} billing {approvalCount === 1 ? "request is" : "requests are"} currently waiting in governance.
                </p>
            ) : null}

            <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-medium text-white">Session controls</h3>
                    <StatusBadge
                        label={stripeConfigured ? "Checkout enabled" : "Checkout blocked"}
                        tone={stripeConfigured ? "success" : "warning"}
                    />
                    <StatusBadge label={portalReady ? "Portal enabled" : "Portal blocked"} tone={portalReady ? "info" : "neutral"} />
                    {currentSubscriptionStatus ? (
                        <StatusBadge label={currentSubscriptionStatus.replaceAll("_", " ")} tone="neutral" />
                    ) : null}
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">{sessionTruth}</p>

                <div className="mt-5 flex flex-wrap gap-3">
                    <button
                        type="button"
                        data-testid="billing-open-portal"
                        onClick={openPortal}
                        disabled={!portalReady || isPending}
                        className={cn(
                            "rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors",
                            portalReady
                                ? "border-white/10 bg-white/[0.05] text-white hover:border-white/20 hover:bg-white/[0.08]"
                                : "border-white/10 bg-white/[0.03] text-neutral-500",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                        )}
                    >
                        {isPending ? "Working..." : "Open billing portal"}
                    </button>
                </div>
            </article>

            {manualPlans.length > 0 ? (
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-medium text-white">Design-partner plans</h3>
                        <StatusBadge label={`${manualPlans.length}`} tone="neutral" />
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        {manualPlans.map((plan) => {
                            const isCurrent = currentPlanCode === plan.code;
                            return (
                                <article
                                    key={plan.id}
                                    className="rounded-[1.5rem] border border-cyan-400/15 bg-[linear-gradient(180deg,rgba(34,211,238,0.12),rgba(255,255,255,0.02))] p-5"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">
                                                {plan.isDesignPartner ? "Design partner beta" : "Manual billing"}
                                            </p>
                                            <h4 className="mt-2 text-lg font-medium text-white">{plan.name}</h4>
                                        </div>
                                        <StatusBadge label={isCurrent ? "Current" : "Invite only"} tone={isCurrent ? "success" : "info"} />
                                    </div>
                                    <p className="mt-3 text-2xl font-medium tracking-tight text-white">
                                        {plan.priceCents > 0 ? formatMoney(plan.priceCents, plan.currency) : "Provisioned manually"}
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-neutral-300">
                                        {plan.description ?? "Hands-on provisioning with manually managed entitlements and support."}
                                    </p>
                                    <ul className="mt-4 space-y-2 text-sm text-neutral-200">
                                        <li>Term: {formatInterval(plan.interval)}</li>
                                        <li>Seat limit: {plan.seatLimit ?? "Custom"}</li>
                                        <li>World limit: {plan.worldLimit ?? "Custom"}</li>
                                        <li>Monthly credits: {plan.monthlyCreditLimit ?? "Custom"}</li>
                                    </ul>
                                    <button
                                        type="button"
                                        disabled
                                        className="mt-5 w-full cursor-not-allowed rounded-2xl border border-cyan-300/15 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-50 opacity-80"
                                    >
                                        {isCurrent ? "Provisioned for this workspace" : "Provisioned by Gauset"}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            {stripePlans.length > 0 ? (
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-lg font-medium text-white">Self-serve Stripe plans</h3>
                        <StatusBadge label={`${stripePlans.length}`} tone="neutral" />
                    </div>
                    <div className="grid gap-4 xl:grid-cols-2">
                        {stripePlans.map((plan) => {
                            const isCurrent = currentPlanCode === plan.code;
                            return (
                                <article key={plan.id} className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">
                                                {formatInterval(plan.interval)}
                                            </p>
                                            <h4 className="mt-2 text-lg font-medium text-white">{plan.name}</h4>
                                        </div>
                                        {isCurrent ? <StatusBadge label="Current" tone="success" /> : null}
                                    </div>
                                    <p className="mt-3 text-2xl font-medium tracking-tight text-white">{formatMoney(plan.priceCents, plan.currency)}</p>
                                    <p className="mt-2 text-sm leading-7 text-neutral-400">
                                        {plan.description ?? "Production billing plan with Stripe-backed checkout."}
                                    </p>
                                    <ul className="mt-4 space-y-2 text-sm text-neutral-300">
                                        <li>Seat limit: {plan.seatLimit ?? "Custom"}</li>
                                        <li>World limit: {plan.worldLimit ?? "Custom"}</li>
                                        <li>Monthly credits: {plan.monthlyCreditLimit ?? "Custom"}</li>
                                    </ul>
                                    <button
                                        type="button"
                                        data-testid={`billing-checkout-${plan.code}`}
                                        onClick={() => openCheckout(plan.code)}
                                        disabled={isPending || !stripeConfigured || isCurrent}
                                        className={cn(
                                            "mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold transition-colors",
                                            isCurrent
                                                ? "bg-white/[0.04] text-neutral-500"
                                                : "bg-white text-black hover:bg-neutral-200",
                                            "disabled:cursor-not-allowed disabled:opacity-60",
                                        )}
                                    >
                                        {isCurrent ? "Current plan" : stripeConfigured ? "Open Stripe checkout" : "Stripe not configured"}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            {message ? <p className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">{message}</p> : null}
            {error ? <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

            <p className="text-xs leading-6 text-neutral-500">
                Checkout redirect success does not finalize billing locally. Subscription, invoice, payment, refund, and credit state move only after Stripe webhook ingestion.
            </p>
        </section>
    );
}
