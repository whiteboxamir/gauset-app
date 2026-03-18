"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { AdminNote } from "@/server/contracts/admin";
import { formatDateTime } from "@/components/platform/formatters";
import { EmptyState } from "@/components/platform/EmptyState";
import { StatusBadge } from "@/components/platform/StatusBadge";

export function AdminNotesPanel({
    studioId,
    notes,
}: {
    studioId: string;
    notes: AdminNote[];
}) {
    const router = useRouter();
    const [body, setBody] = useState("");
    const [visibility, setVisibility] = useState<AdminNote["visibility"]>("internal");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const trimmedBody = body.trim();

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Admin notes</p>
                <h3 className="mt-2 text-lg font-medium text-white">Internal operating record</h3>
            </div>

            <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch(`/api/admin/accounts/${studioId}/notes`, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    body: trimmedBody,
                                    visibility,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to create admin note.");
                            }

                            setBody("");
                            setVisibility("internal");
                            setMessage("Admin note added.");
                            router.refresh();
                        } catch (noteError) {
                            setError(noteError instanceof Error ? noteError.message : "Unable to create admin note.");
                        }
                    });
                }}
            >
                <select
                    value={visibility}
                    onChange={(event) => setVisibility(event.target.value as AdminNote["visibility"])}
                    disabled={isPending}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                >
                    <option value="internal" className="bg-black text-white">
                        Internal
                    </option>
                    <option value="finance" className="bg-black text-white">
                        Finance
                    </option>
                </select>
                <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    disabled={isPending}
                    rows={5}
                    placeholder="Internal context, escalation notes, or partner risk tracking."
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                />
                <button
                    type="submit"
                    disabled={isPending || !trimmedBody}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Saving..." : "Add note"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

            <div className="mt-6 space-y-3">
                {notes.length === 0 ? (
                    <EmptyState eyebrow="Notes" title="No admin notes yet" body="Internal notes created for this studio will appear here." />
                ) : (
                    notes.map((note) => (
                        <article key={note.noteId} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge label={note.visibility} tone="neutral" />
                                    <p className="text-xs text-neutral-500">{note.authorEmail ?? "Unknown admin"}</p>
                                </div>
                                <p className="text-xs text-neutral-500">{formatDateTime(note.createdAt)}</p>
                            </div>
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-neutral-300">{note.body}</p>
                        </article>
                    ))
                )}
            </div>
        </section>
    );
}
