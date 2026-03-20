"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { NotificationFeedSnapshot, NotificationPreferences } from "@/server/contracts/notifications";

import { LaneSubscriptionPanel } from "@/components/platform/LaneSubscriptionPanel";
import { StatusBadge } from "@/components/platform/StatusBadge";

function getSeverityTone(severity: NotificationFeedSnapshot["items"][number]["signal"]["severity"]) {
    switch (severity) {
        case "urgent":
            return "danger";
        case "warning":
            return "warning";
        case "info":
        default:
            return "info";
    }
}

function toDraft(preferences: NotificationPreferences) {
    return {
        ...preferences,
        digestHourUtc: String(preferences.digestHourUtc),
        digestWeekday: String(preferences.digestWeekday),
    };
}

export function NotificationControlPlane({
    preferences,
    feed,
}: {
    preferences: NotificationPreferences;
    feed: NotificationFeedSnapshot;
}) {
    const router = useRouter();
    const [draft, setDraft] = useState(() => toDraft(preferences));
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const updateDelivery = (deliveryId: string, action: "acknowledge" | "dismiss") => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/account/notifications/deliveries/${encodeURIComponent(deliveryId)}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ action }),
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to update notification delivery.");
                }

                setMessage(action === "acknowledge" ? "Notification acknowledged." : "Notification dismissed.");
                router.refresh();
            } catch (deliveryError) {
                setError(deliveryError instanceof Error ? deliveryError.message : "Unable to update notification delivery.");
            }
        });
    };

    return (
        <section className="space-y-6">
            <section className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.16),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Notifications OS</p>
                        <h2 className="mt-2 text-2xl font-medium tracking-tight text-white">Persistent routing, lane follows, and digest posture</h2>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">
                            This surface now stores routed in-app deliveries per user and per signal. Signals explain why they exist, who they route to, and where the platform expects you to go next.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={`${feed.unreadCount} unread`} tone={feed.unreadCount > 0 ? "warning" : "success"} />
                        <StatusBadge label={`${feed.subscriptions.filter((subscription) => subscription.following).length} followed`} tone="info" />
                        <StatusBadge label={preferences.inAppEnabled ? "In-app on" : "In-app muted"} tone={preferences.inAppEnabled ? "success" : "warning"} />
                    </div>
                </div>
            </section>

            <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Delivery policy</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Control channel and digest defaults</h3>
                </div>

                <form
                    className="mt-5 space-y-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setMessage(null);
                        setError(null);

                        startTransition(async () => {
                            try {
                                const response = await fetch("/api/account/notifications", {
                                    method: "PUT",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        inAppEnabled: draft.inAppEnabled,
                                        digestEnabled: draft.digestEnabled,
                                        digestCadence: draft.digestCadence,
                                        digestHourUtc: Number(draft.digestHourUtc),
                                        digestWeekday: Number(draft.digestWeekday),
                                    }),
                                });
                                const payload = (await response.json()) as { success?: boolean; message?: string };
                                if (!response.ok || !payload.success) {
                                    throw new Error(payload.message || "Unable to update notification preferences.");
                                }

                                setMessage("Notification delivery policy updated.");
                                router.refresh();
                            } catch (preferencesError) {
                                setError(
                                    preferencesError instanceof Error
                                        ? preferencesError.message
                                        : "Unable to update notification preferences.",
                                );
                            }
                        });
                    }}
                >
                    <div className="grid gap-3 lg:grid-cols-2">
                        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                            <input
                                type="checkbox"
                                checked={draft.inAppEnabled}
                                onChange={(event) => setDraft((current) => ({ ...current, inAppEnabled: event.target.checked }))}
                                disabled={isPending}
                                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                            />
                            <div>
                                <p className="text-sm font-medium text-white">Enable in-app delivery</p>
                                <p className="mt-1 text-sm leading-6 text-neutral-400">
                                    New routed deliveries stay persistent inside the platform shell instead of depending on passive UI copy.
                                </p>
                            </div>
                        </label>
                        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                            <input
                                type="checkbox"
                                checked={draft.digestEnabled}
                                onChange={(event) => setDraft((current) => ({ ...current, digestEnabled: event.target.checked }))}
                                disabled={isPending}
                                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                            />
                            <div>
                                <p className="text-sm font-medium text-white">Enable digest preview</p>
                                <p className="mt-1 text-sm leading-6 text-neutral-400">
                                    Digest views are derived from persisted signals on read. No outbound email system is added here.
                                </p>
                            </div>
                        </label>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                        <label className="space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Digest cadence</span>
                            <select
                                value={draft.digestCadence}
                                onChange={(event) =>
                                    setDraft((current) => ({
                                        ...current,
                                        digestCadence: event.target.value as NotificationPreferences["digestCadence"],
                                    }))
                                }
                                disabled={isPending}
                                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                            >
                                <option value="daily" className="bg-neutral-950 text-white">
                                    Daily
                                </option>
                                <option value="weekly" className="bg-neutral-950 text-white">
                                    Weekly
                                </option>
                            </select>
                        </label>
                        <label className="space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Digest hour (UTC)</span>
                            <input
                                type="number"
                                min={0}
                                max={23}
                                value={draft.digestHourUtc}
                                onChange={(event) => setDraft((current) => ({ ...current, digestHourUtc: event.target.value }))}
                                disabled={isPending}
                                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                            />
                        </label>
                        <label className="space-y-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Digest weekday</span>
                            <select
                                value={draft.digestWeekday}
                                onChange={(event) => setDraft((current) => ({ ...current, digestWeekday: event.target.value }))}
                                disabled={isPending}
                                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                            >
                                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, index) => (
                                    <option key={label} value={index} className="bg-neutral-950 text-white">
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <button
                        type="submit"
                        disabled={isPending}
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isPending ? "Saving..." : "Save notification policy"}
                    </button>
                </form>

                {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
                {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
            </section>

            <LaneSubscriptionPanel
                title="Follow or mute platform lanes"
                subtitle="Lane subscriptions change real delivery state for this workspace instead of hiding static copy on one page."
                subscriptions={feed.subscriptions}
            />

            <section className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
                <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Signal feed</p>
                            <h3 className="mt-2 text-lg font-medium text-white">Unread, acknowledged, and dismissed history</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge label={`${feed.pendingCount} active`} tone={feed.pendingCount > 0 ? "warning" : "success"} />
                            <StatusBadge label={`${feed.acknowledgedCount} acknowledged`} tone="info" />
                            <StatusBadge label={`${feed.dismissedCount} dismissed`} tone="neutral" />
                        </div>
                    </div>

                    {feed.items.length === 0 ? (
                        <p className="mt-4 text-sm leading-7 text-neutral-400">
                            Routed signals will appear here once the workspace starts generating platform-state changes that match your lane follows.
                        </p>
                    ) : (
                        <div className="mt-5 space-y-3">
                            {feed.items.map((item) => (
                                <article key={item.deliveryId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="max-w-3xl">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium text-white">{item.signal.title}</p>
                                                <StatusBadge label={item.signal.domain} tone="neutral" />
                                                <StatusBadge label={item.signal.severity} tone={getSeverityTone(item.signal.severity)} />
                                                <StatusBadge label={item.state} tone={item.isUnread ? "warning" : item.state === "acknowledged" ? "info" : "neutral"} />
                                            </div>
                                            <p className="mt-2 text-sm leading-6 text-neutral-300">{item.signal.body}</p>
                                            <p className="mt-2 text-sm leading-6 text-neutral-400">
                                                Why this exists: <span className="text-neutral-200">{item.signal.why}</span>
                                            </p>
                                            <p className="mt-1 text-sm leading-6 text-neutral-400">
                                                Routed to: <span className="text-neutral-200">{item.signal.audienceLabel}</span> because {item.deliveryReason}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <Link
                                                href={item.signal.href}
                                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                                            >
                                                Open route
                                            </Link>
                                            <button
                                                type="button"
                                                disabled={isPending || item.state === "acknowledged"}
                                                onClick={() => updateDelivery(item.deliveryId, "acknowledge")}
                                                className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-100 transition-colors hover:border-emerald-300/30 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Acknowledge
                                            </button>
                                            <button
                                                type="button"
                                                disabled={isPending || item.state === "dismissed"}
                                                onClick={() => updateDelivery(item.deliveryId, "dismiss")}
                                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>

                <section className="space-y-6">
                    <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Digest preview</p>
                        <h3 className="mt-2 text-lg font-medium text-white">{feed.digest.scheduledForLabel}</h3>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">
                            Digest views are derived from the persisted signal ledger. They stay read-only until a future program needs outbound delivery.
                        </p>

                        <div className="mt-5 flex flex-wrap gap-2">
                            <StatusBadge label={preferences.digestEnabled ? "Digest enabled" : "Digest muted"} tone={preferences.digestEnabled ? "success" : "warning"} />
                            <StatusBadge label={feed.digest.cadence} tone="info" />
                        </div>

                        {feed.digest.items.length === 0 ? (
                            <p className="mt-4 text-sm leading-7 text-neutral-400">No digest items are queued from the current signal history.</p>
                        ) : (
                            <div className="mt-4 space-y-3">
                                {feed.digest.domainCounts.map((entry) => (
                                    <div key={entry.domain} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-medium text-white">{entry.domain}</p>
                                            <div className="flex flex-wrap gap-2">
                                                <StatusBadge label={`${entry.count} items`} tone="neutral" />
                                                {entry.urgentCount > 0 ? <StatusBadge label={`${entry.urgentCount} urgent`} tone="danger" /> : null}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </article>

                    <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Routing notes</p>
                        <ul className="mt-4 space-y-3 text-sm leading-7 text-neutral-400">
                            <li>Unread counts stay consistent between the shell entry point and this settings route because both read from the same delivery ledger.</li>
                            <li>Acknowledge preserves history while clearing unread pressure. Dismiss removes the item from active digest posture without deleting audit history.</li>
                            <li>Lane follows and mutes are scoped to the active workspace, so switching workspaces changes both feed content and subscription posture.</li>
                        </ul>
                    </article>
                </section>
            </section>
        </section>
    );
}
