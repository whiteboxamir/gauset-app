import { notFound } from "next/navigation";

import { AdminSupportReplyComposer } from "@/components/admin/AdminSupportReplyComposer";
import { AdminSupportThreadControls } from "@/components/admin/AdminSupportThreadControls";
import { SupportThreadMessages } from "@/components/support/SupportThreadMessages";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";
import { requireAdminSession } from "@/server/admin/access";
import { getAdminSupportThreadDetail } from "@/server/admin/service";

export default async function AdminSupportThreadPage({
    params,
}: {
    params: Promise<{ threadId: string }>;
}) {
    const session = await requireAdminSession("/admin/support");
    const { threadId } = await params;
    const detail = await getAdminSupportThreadDetail(threadId);

    if (!detail) {
        notFound();
    }
    const latestMessage = detail.messages[detail.messages.length - 1] ?? null;

    return (
        <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Admin support thread</p>
                        <h1 className="mt-2 text-3xl font-medium tracking-tight text-white">{detail.thread.subject}</h1>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">
                            {detail.thread.studioName} · {detail.thread.projectName ?? "No project"} · Latest {formatDateTime(detail.thread.latestMessageAt ?? detail.thread.createdAt)}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={detail.thread.priority} tone={detail.thread.priority === "urgent" ? "warning" : "neutral"} />
                        <StatusBadge label={detail.thread.status} tone={detail.thread.status === "open" ? "success" : "info"} />
                        <StatusBadge label={`${detail.thread.messageCount} messages`} tone="neutral" />
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Assignment</p>
                    <p className="mt-3 text-lg text-white">
                        {!detail.thread.assignedAdminUserId
                            ? "Unassigned"
                            : detail.thread.assignedAdminUserId === session.user.userId
                              ? "Assigned to you"
                              : detail.assignedAdminEmail ?? "Assigned to another admin"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">Replies from admin automatically preserve assignment inside the queue.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Next response</p>
                    <p className="mt-3 text-lg text-white">
                        {detail.thread.status === "resolved" || detail.thread.status === "closed"
                            ? "Closed unless the partner replies"
                            : latestMessage?.authorType === "admin"
                              ? "Waiting on partner"
                              : "Gauset owes next response"}
                    </p>
                    <p className="mt-1 text-sm text-neutral-500">
                        {latestMessage?.authorType === "admin"
                            ? "The latest recorded message came from an internal admin operator."
                            : latestMessage?.authorType === "user"
                              ? "The latest recorded message came from the workspace."
                              : "No participant reply has been recorded yet."}
                    </p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Thread truth</p>
                    <p className="mt-3 text-lg text-white">{detail.thread.status}</p>
                    <p className="mt-1 text-sm text-neutral-500">Triage and replies here update the same persisted support ledger the partner sees.</p>
                </article>
            </section>

            <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
                <div className="space-y-6">
                    <AdminSupportThreadControls
                        thread={detail.thread}
                        currentAdminUserId={session.user.userId}
                        assignedAdminEmail={detail.assignedAdminEmail}
                        latestAuthorType={latestMessage?.authorType ?? null}
                    />
                    <AdminSupportReplyComposer threadId={detail.thread.threadId} />
                </div>
                <SupportThreadMessages messages={detail.messages} />
            </div>
        </div>
    );
}
