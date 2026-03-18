import Link from "next/link";

import type { AdminSupportQueueItem } from "@/server/contracts/admin";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";

export function AdminSupportQueueList({
    threads,
    title = "Support queue",
}: {
    threads: AdminSupportQueueItem[];
    title?: string;
}) {
    if (threads.length === 0) {
        return <EmptyState eyebrow="Support" title={title} body="No support threads are waiting in the queue." />;
    }

    const urgentCount = threads.filter((thread) => thread.priority === "urgent" && (thread.status === "open" || thread.status === "pending")).length;
    const waitingCount = threads.filter((thread) => thread.status === "open" || thread.status === "pending").length;
    const assignedCount = threads.filter((thread) => thread.assignedAdminUserId).length;

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Support queue</p>
                    <h3 className="mt-2 text-lg font-medium text-white">{title}</h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                        This queue reflects stored support-thread state. It is an internal operating surface, not a claim that every route is fully staging-certified.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={`${waitingCount} active`} tone={waitingCount > 0 ? "warning" : "success"} />
                    <StatusBadge label={`${urgentCount} urgent`} tone={urgentCount > 0 ? "warning" : "neutral"} />
                    <StatusBadge label={`${assignedCount} assigned`} tone="info" />
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {threads.map((thread) => (
                    <Link
                        key={thread.threadId}
                        href={`/admin/support/${thread.threadId}`}
                        className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-white">{thread.subject}</p>
                                <p className="mt-1 text-sm text-neutral-500">
                                    {thread.studioName} · {thread.projectName ?? "No project"} · {thread.messageCount} messages
                                </p>
                                <p className="mt-2 text-xs text-neutral-500">
                                    {thread.assignedAdminUserId ? "Assigned to an admin operator." : "Still unassigned in the admin queue."}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <StatusBadge label={thread.priority} tone={thread.priority === "urgent" ? "warning" : "neutral"} />
                                <StatusBadge label={thread.status} tone={thread.status === "open" ? "success" : "info"} />
                                <StatusBadge label={thread.assignedAdminUserId ? "Assigned" : "Unassigned"} tone={thread.assignedAdminUserId ? "info" : "warning"} />
                            </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">{thread.latestMessagePreview ?? "No preview yet."}</p>
                        <p className="mt-3 text-xs text-neutral-500">Latest activity {formatDateTime(thread.latestMessageAt ?? thread.createdAt)}</p>
                    </Link>
                ))}
            </div>
        </section>
    );
}
