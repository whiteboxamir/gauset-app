import { StatusBadge } from "@/components/platform/StatusBadge";
import { AdminSupportQueueList } from "@/components/admin/AdminSupportQueueList";
import { requireAdminSession } from "@/server/admin/access";
import { getAdminOperationsSnapshot } from "@/server/admin/service";

export default async function AdminSupportPage() {
    await requireAdminSession("/admin/support");
    const snapshot = await getAdminOperationsSnapshot();
    const activeThreads = snapshot.supportQueue.filter((thread) => thread.status === "open" || thread.status === "pending").length;
    const urgentThreads = snapshot.supportQueue.filter(
        (thread) => thread.priority === "urgent" && (thread.status === "open" || thread.status === "pending"),
    ).length;
    const unassignedThreads = snapshot.supportQueue.filter((thread) => !thread.assignedAdminUserId).length;

    return (
        <div className="space-y-6">
            <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="max-w-3xl">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Admin support</p>
                        <h1 className="mt-2 text-3xl font-medium tracking-tight text-white">Internal triage queue</h1>
                        <p className="mt-3 text-sm leading-7 text-neutral-300">
                            This queue tracks internal support posture, assignment, and urgency from persisted thread state. It intentionally avoids overstating operational certification beyond what the queue itself can prove.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge label={`${activeThreads} active`} tone={activeThreads > 0 ? "warning" : "success"} />
                        <StatusBadge label={`${urgentThreads} urgent`} tone={urgentThreads > 0 ? "warning" : "neutral"} />
                        <StatusBadge label={`${unassignedThreads} unassigned`} tone={unassignedThreads > 0 ? "warning" : "info"} />
                    </div>
                </div>
            </section>

            <AdminSupportQueueList threads={snapshot.supportQueue} title="Global support queue" />
        </div>
    );
}
