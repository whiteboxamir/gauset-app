"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { AdminSupportQueueItem } from "@/server/contracts/admin";

export function AdminSupportThreadControls({
    thread,
    currentAdminUserId,
    assignedAdminEmail,
    latestAuthorType,
}: {
    thread: AdminSupportQueueItem;
    currentAdminUserId: string;
    assignedAdminEmail?: string | null;
    latestAuthorType?: "user" | "admin" | "system" | null;
}) {
    const router = useRouter();
    const [status, setStatus] = useState(thread.status);
    const [priority, setPriority] = useState(thread.priority);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const assignmentState = !thread.assignedAdminUserId
        ? "Unassigned"
        : thread.assignedAdminUserId === currentAdminUserId
          ? "Assigned to you"
          : assignedAdminEmail ?? "Assigned to another admin";
    const nextResponseState =
        thread.status === "resolved" || thread.status === "closed"
            ? "Closed unless the partner replies"
            : latestAuthorType === "admin"
              ? "Waiting on partner"
              : latestAuthorType === "user"
                ? "Gauset owes next response"
                : "No participant reply yet";
    const hasFieldChanges = status !== thread.status || priority !== thread.priority;

    const submit = (assignToSelf = false) => {
        setMessage(null);
        setError(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/admin/support/threads/${thread.threadId}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        status,
                        priority,
                        assignToSelf,
                    }),
                });
                const payload = (await response.json()) as { success?: boolean; message?: string };
                if (!response.ok || !payload.success) {
                    throw new Error(payload.message || "Unable to update support thread.");
                }

                setMessage(assignToSelf ? "Thread assigned and updated." : "Support thread updated.");
                router.refresh();
            } catch (threadError) {
                setError(threadError instanceof Error ? threadError.message : "Unable to update support thread.");
            }
        });
    };

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Triage</p>
                <h3 className="mt-2 text-lg font-medium text-white">Status and assignment</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                    Triage state here is operational truth for the internal queue only. It records assignment and next-step posture without claiming broader staging certification.
                </p>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Assignment</p>
                    <p className="mt-2 text-lg font-medium text-white">{assignmentState}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Assigning the thread records responsibility in the queue instead of relying on an external handoff.
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Next response</p>
                    <p className="mt-2 text-lg font-medium text-white">{nextResponseState}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        `pending` means the partner is waiting on Gauset. `resolved` and `closed` remain historical until the user replies.
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Priority posture</p>
                    <p className="mt-2 text-lg font-medium text-white">{thread.priority}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Priority affects queue pressure and response ordering. It is not a substitute for an explicit partner-facing commitment.
                    </p>
                </article>
            </div>

            <div className="mt-5 space-y-4">
                <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value as typeof status)}
                    disabled={isPending}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                >
                    {["open", "pending", "resolved", "closed"].map((option) => (
                        <option key={option} value={option} className="bg-black text-white">
                            {option}
                        </option>
                    ))}
                </select>
                <select
                    value={priority}
                    onChange={(event) => setPriority(event.target.value as typeof priority)}
                    disabled={isPending}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                >
                    {["low", "normal", "high", "urgent"].map((option) => (
                        <option key={option} value={option} className="bg-black text-white">
                            {option}
                        </option>
                    ))}
                </select>

                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        disabled={isPending || !hasFieldChanges}
                        onClick={() => submit(false)}
                        className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isPending ? "Saving..." : "Save triage"}
                    </button>
                    <button
                        type="button"
                        disabled={isPending || thread.assignedAdminUserId === currentAdminUserId}
                        onClick={() => submit(true)}
                        className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        Assign to me
                    </button>
                </div>
            </div>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
