"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

export function SupportReplyComposer({
    threadId,
}: {
    threadId: string;
}) {
    const router = useRouter();
    const [body, setBody] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const trimmedBody = body.trim();

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Reply</p>
                <h3 className="mt-2 text-lg font-medium text-white">Add more context</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-400">
                    User replies append to the same support ledger. Replying to a resolved or closed thread moves it back into the pending queue for review.
                </p>
            </div>

            <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch(`/api/support/threads/${threadId}/messages`, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    body: trimmedBody,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to send support reply.");
                            }

                            setBody("");
                            setMessage("Reply sent.");
                            router.refresh();
                        } catch (replyError) {
                            setError(replyError instanceof Error ? replyError.message : "Unable to send support reply.");
                        }
                    });
                }}
            >
                <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    disabled={isPending}
                    rows={5}
                    placeholder="Add new evidence, delivery pressure, or repro steps here."
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                />

                <button
                    type="submit"
                    disabled={isPending || !trimmedBody}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Sending..." : "Send reply"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
