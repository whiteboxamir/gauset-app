import Link from "next/link";

import type { NotificationShellSummary } from "@/server/contracts/notifications";

import { StatusBadge } from "@/components/platform/StatusBadge";

function getSeverityTone(severity: NotificationShellSummary["items"][number]["signal"]["severity"]) {
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

export function NotificationCenterEntry({
    summary,
}: {
    summary: NotificationShellSummary;
}) {
    const items = summary.items;

    return (
        <div className="w-full max-w-[28rem] rounded-[1.35rem] border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Notifications</p>
                    <p className="mt-2 text-sm text-neutral-300">
                        {summary.unreadCount > 0
                            ? `${summary.unreadCount} unread routed signal${summary.unreadCount === 1 ? "" : "s"}`
                            : "No unread platform signals"}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={`${summary.unreadCount} unread`} tone={summary.unreadCount > 0 ? "warning" : "success"} />
                    {summary.stale ? <StatusBadge label="Syncing" tone="neutral" /> : null}
                    <Link href="/app/settings/notifications" className="text-sm font-medium text-white transition-opacity hover:opacity-80">
                        Open inbox
                    </Link>
                </div>
            </div>

            {items.length === 0 ? (
                <p className="mt-4 text-sm leading-7 text-neutral-400">
                    Routed signals, digest posture, and lane follows will surface here once a workspace generates platform state changes.
                </p>
            ) : (
                <div className="mt-4 space-y-3">
                    {items.map((item) => (
                        <Link
                            key={item.deliveryId}
                            href={item.signal.href}
                            className="block rounded-2xl border border-white/10 bg-black/20 px-3 py-3 transition-colors hover:border-white/20 hover:bg-black/30"
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-medium text-white">{item.signal.title}</p>
                                    <p className="mt-1 text-sm leading-6 text-neutral-400">{item.signal.why}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <StatusBadge label={item.signal.domain} tone="neutral" />
                                    <StatusBadge label={item.signal.severity} tone={getSeverityTone(item.signal.severity)} />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
