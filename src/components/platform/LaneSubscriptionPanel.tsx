"use client";

import { useMemo, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { NotificationSubscription } from "@/server/contracts/notifications";

import { StatusBadge } from "@/components/platform/StatusBadge";

const laneLabels: Record<NotificationSubscription["domain"], string> = {
    workspace: "Workspace",
    billing: "Billing",
    team: "Team",
    support: "Support",
    projects: "Projects",
    governance: "Governance",
    coverage: "Coverage",
};

export function LaneSubscriptionPanel({
    title,
    eyebrow = "Lane routing",
    subtitle,
    subscriptions,
    domains,
    compact = false,
}: {
    title: string;
    eyebrow?: string;
    subtitle?: string;
    subscriptions: NotificationSubscription[];
    domains?: NotificationSubscription["domain"][];
    compact?: boolean;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(subscriptions.map((subscription) => [subscription.domain, subscription.following])),
    );
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const visibleSubscriptions = useMemo(
        () => subscriptions.filter((subscription) => !domains || domains.includes(subscription.domain)),
        [domains, subscriptions],
    );

    const updateSubscription = (subscription: NotificationSubscription, following: boolean) => {
        setMessage(null);
        setError(null);
        setDraft((current) => ({
            ...current,
            [subscription.domain]: following,
        }));

        startTransition(async () => {
            try {
                const response = await fetch("/api/account/notifications/subscriptions", {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        domain: subscription.domain,
                        following,
                    }),
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to update lane subscription.");
                }

                setMessage(`${following ? "Following" : "Muted"} ${laneLabels[subscription.domain].toLowerCase()} lane.`);
                router.refresh();
            } catch (subscriptionError) {
                setDraft((current) => ({
                    ...current,
                    [subscription.domain]: subscription.following,
                }));
                setError(subscriptionError instanceof Error ? subscriptionError.message : "Unable to update lane subscription.");
            }
        });
    };

    return (
        <section className={`rounded-[1.75rem] border border-white/10 bg-black/30 ${compact ? "p-5" : "p-6"}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">{eyebrow}</p>
                    <h3 className="mt-2 text-lg font-medium text-white">{title}</h3>
                    {subtitle ? <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">{subtitle}</p> : null}
                </div>
                <StatusBadge label={isPending ? "Updating" : "Live"} tone={isPending ? "warning" : "success"} />
            </div>

            <div className={`mt-5 grid gap-3 ${compact ? "" : "lg:grid-cols-2"}`}>
                {visibleSubscriptions.map((subscription) => {
                    const following = draft[subscription.domain] ?? subscription.following;

                    return (
                        <article key={subscription.domain} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium text-white">{laneLabels[subscription.domain]}</p>
                                        {subscription.inherited ? <StatusBadge label="Inherited" tone="neutral" /> : <StatusBadge label="Explicit" tone="info" />}
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-neutral-400">{subscription.reason}</p>
                                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-neutral-500">{subscription.audienceLabel}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={isPending || following}
                                        onClick={() => updateSubscription(subscription, true)}
                                        className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:border-emerald-300/30 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Follow
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isPending || !following}
                                        onClick={() => updateSubscription(subscription, false)}
                                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Mute
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <StatusBadge label={following ? "Following" : "Muted"} tone={following ? "success" : "warning"} />
                                <StatusBadge label={laneLabels[subscription.domain]} tone="neutral" />
                            </div>
                        </article>
                    );
                })}
            </div>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
