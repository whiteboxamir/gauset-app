import Link from "next/link";

import type { SupportThreadSummary } from "@/server/contracts/support";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";

export function SupportThreadList({
    threads,
    title = "Support inbox",
    prioritySupportEnabled,
}: {
    threads: SupportThreadSummary[];
    title?: string;
    prioritySupportEnabled: boolean;
}) {
    if (threads.length === 0) {
        return <EmptyState eyebrow="Support" title={title} body="No support threads yet. Open the first one when you need product, billing, or partner help with full studio context." />;
    }

    const activeCount = threads.filter((thread) => thread.status === "open" || thread.status === "pending").length;
    const urgentCount = threads.filter((thread) => thread.priority === "urgent" && (thread.status === "open" || thread.status === "pending")).length;
    const resolvedCount = threads.filter((thread) => thread.status === "resolved" || thread.status === "closed").length;

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Support inbox</p>
                    <h3 className="mt-2 text-lg font-medium text-white">{title}</h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                        Priority changes support routing inside the workspace operating layer. It does not imply an external uptime commitment or finished staging certification.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={`${activeCount} active`} tone={activeCount > 0 ? "warning" : "success"} />
                    <StatusBadge label={`${urgentCount} urgent`} tone={urgentCount > 0 ? "warning" : "neutral"} />
                    <StatusBadge label={`${resolvedCount} historical`} tone="neutral" />
                    <StatusBadge label={prioritySupportEnabled ? "Priority routing" : "Standard routing"} tone={prioritySupportEnabled ? "success" : "neutral"} />
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {threads.map((thread) => (
                    <Link
                        key={thread.threadId}
                        href={`/app/support/${thread.threadId}`}
                        className="block rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-white">{thread.subject}</p>
                                <p className="mt-1 text-sm text-neutral-500">
                                    {thread.projectName ?? "No project attached"} · {thread.messageCount} messages
                                </p>
                                <p className="mt-2 text-xs text-neutral-500">
                                    {thread.status === "open" || thread.status === "pending"
                                        ? thread.assignedAdminUserId
                                            ? "Assigned inside Gauset and waiting on the next queue step."
                                            : "Still waiting for internal assignment."
                                        : "Historical thread that can be reopened by reply."}
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <StatusBadge label={thread.priority} tone={thread.priority === "urgent" ? "warning" : "neutral"} />
                                <StatusBadge label={thread.status} tone={thread.status === "open" ? "success" : "info"} />
                            </div>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">{thread.latestMessagePreview ?? "No messages yet."}</p>
                        <p className="mt-3 text-xs text-neutral-500">Latest activity {formatDateTime(thread.latestMessageAt ?? thread.createdAt)}</p>
                    </Link>
                ))}
            </div>
        </section>
    );
}
