"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

type ProjectOption = {
    id: string;
    label: string;
};

export function SupportThreadComposer({
    projectOptions,
    prioritySupportEnabled,
}: {
    projectOptions: ProjectOption[];
    prioritySupportEnabled: boolean;
}) {
    const router = useRouter();
    const [subject, setSubject] = useState("");
    const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
    const [projectId, setProjectId] = useState("");
    const [body, setBody] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    const canSubmit = !isPending && trimmedSubject.length > 0 && trimmedBody.length > 0;

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Open support thread</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Give the team full operating context</h3>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-neutral-400">
                        Threads stay attached to a workspace and can carry project context. Priority changes queue pressure and operator visibility, but it does not claim a live certified SLA on its own.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${prioritySupportEnabled ? "border border-emerald-400/20 bg-emerald-500/10 text-emerald-100" : "border border-white/10 bg-white/[0.04] text-white"}`}>
                        {prioritySupportEnabled ? "Priority support enabled" : "Standard support routing"}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white">
                        {projectOptions.length} project context option{projectOptions.length === 1 ? "" : "s"}
                    </span>
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Urgent means routed pressure</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Use `urgent` when a blocked delivery, deadline, or partner-impacting regression needs immediate operator attention.
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Project context matters</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Attaching a project gives support a stable ownership anchor instead of relying on free-form repro text alone.
                    </p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Thread truth</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">
                        Replies, admin notes, and queue changes are persisted here. This is a workspace support ledger, not an external email-only shadow process.
                    </p>
                </article>
            </div>

            <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch("/api/support/threads", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    subject: trimmedSubject,
                                    priority,
                                    projectId: projectId || null,
                                    body: trimmedBody,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string; threadId?: string };
                            if (!response.ok || !payload.success || !payload.threadId) {
                                throw new Error(payload.message || "Unable to create support thread.");
                            }

                            setSubject("");
                            setPriority("normal");
                            setProjectId("");
                            setBody("");
                            setMessage("Support thread created.");
                            router.push(`/app/support/${payload.threadId}`);
                            router.refresh();
                        } catch (supportError) {
                            setError(supportError instanceof Error ? supportError.message : "Unable to create support thread.");
                        }
                    });
                }}
            >
                <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Subject</label>
                    <input
                        value={subject}
                        onChange={(event) => setSubject(event.target.value)}
                        disabled={isPending}
                        placeholder="World ownership mismatch on hospitality pilot"
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Priority</label>
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
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Project context</label>
                        <select
                            value={projectId}
                            onChange={(event) => setProjectId(event.target.value)}
                            disabled={isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                        >
                            <option value="" className="bg-black text-white">
                                No project selected
                            </option>
                            {projectOptions.map((option) => (
                                <option key={option.id} value={option.id} className="bg-black text-white">
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Message</label>
                    <textarea
                        value={body}
                        onChange={(event) => setBody(event.target.value)}
                        disabled={isPending}
                        rows={6}
                        placeholder="Describe what broke, which project or scene it affected, what the expected behavior was, and any deadline pressure."
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                </div>

                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Opening..." : "Open thread"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
