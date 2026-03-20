import { notFound } from "next/navigation";

import { CoverageSurfacePanel } from "@/components/platform/CoverageSurfacePanel";
import { SupportReplyComposer } from "@/components/support/SupportReplyComposer";
import { SupportThreadMessages } from "@/components/support/SupportThreadMessages";
import { StatusBadge } from "@/components/platform/StatusBadge";
import { formatDateTime } from "@/components/platform/formatters";
import { requireAuthSession } from "@/server/auth/guards";
import { getCoordinationSnapshotForSession } from "@/server/platform/coordination";
import { getSupportThreadDetailForSession } from "@/server/support/service";

export default async function PlatformSupportThreadPage({
    params,
}: {
    params: Promise<{ threadId: string }>;
}) {
    const session = await requireAuthSession("/app/support");
    const { threadId } = await params;
    const [detail, coordinationSnapshot] = await Promise.all([getSupportThreadDetailForSession(session, threadId), getCoordinationSnapshotForSession(session)]);

    if (!detail) {
        notFound();
    }
    const latestMessage = detail.messages[detail.messages.length - 1] ?? null;
    const queueOwnerLabel = detail.thread.assignedAdminUserId ? "Assigned internally" : "Awaiting assignment";
    const nextResponseLabel =
        detail.thread.status === "resolved" || detail.thread.status === "closed"
            ? "Reopens when you reply"
            : latestMessage?.authorType === "admin"
              ? "Waiting on workspace reply"
              : "Waiting on Gauset";
    const supportItems = [...coordinationSnapshot.actionCenter.urgent, ...coordinationSnapshot.actionCenter.watch].filter(
        (item) => item.entityType === "support_thread" && item.entityId === threadId,
    );

    return (
        <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Support thread</p>
                        <h1 className="mt-2 text-3xl font-medium tracking-tight text-white">{detail.thread.subject}</h1>
                        <p className="mt-3 text-sm leading-7 text-neutral-400">
                            {detail.thread.projectName ?? "No project attached"} · Created {formatDateTime(detail.thread.createdAt)}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={detail.thread.priority} tone={detail.thread.priority === "urgent" ? "warning" : "neutral"} />
                        <StatusBadge label={detail.thread.status} tone={detail.thread.status === "open" ? "success" : "info"} />
                        <StatusBadge label={`${detail.thread.messageCount} messages`} tone="neutral" />
                    </div>
                </div>
            </section>

            <CoverageSurfacePanel
                eyebrow="Support coverage"
                title="Owner availability on this support thread"
                domains={["support"]}
                items={supportItems}
                coverage={coordinationSnapshot.coverage}
                viewer={coordinationSnapshot.viewer}
                operators={coordinationSnapshot.operators}
                maxSnoozeHours={coordinationSnapshot.workload.maxSnoozeHours}
                emptyBody="This thread has no open coordination blockers right now."
            />

            <section className="grid gap-4 xl:grid-cols-3">
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Queue owner</p>
                    <p className="mt-3 text-lg text-white">{queueOwnerLabel}</p>
                    <p className="mt-1 text-sm text-neutral-500">This only reflects internal assignment posture, not a named operator identity.</p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Next response</p>
                    <p className="mt-3 text-lg text-white">{nextResponseLabel}</p>
                    <p className="mt-1 text-sm text-neutral-500">
                        {latestMessage?.authorType === "admin"
                            ? "The latest visible message came from Gauset ops."
                            : latestMessage?.authorType === "user"
                              ? "The latest visible message came from the workspace."
                              : "No participant reply has landed yet."}
                    </p>
                </article>
                <article className="rounded-[1.75rem] border border-white/10 bg-black/30 p-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">Thread truth</p>
                    <p className="mt-3 text-lg text-white">{detail.thread.status}</p>
                    <p className="mt-1 text-sm text-neutral-500">Assignment and reply state live in the same support ledger instead of a separate email-only handoff.</p>
                </article>
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
                <SupportThreadMessages messages={detail.messages} />
                <SupportReplyComposer threadId={detail.thread.threadId} />
            </div>
        </div>
    );
}
