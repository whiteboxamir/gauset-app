"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

export function AdminCreditGrantPanel({
    studioId,
}: {
    studioId: string;
}) {
    const router = useRouter();
    const [amount, setAmount] = useState("500");
    const [note, setNote] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const parsedAmount = Number(amount);
    const canSubmit = Number.isInteger(parsedAmount) && parsedAmount !== 0 && !isPending;

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Credits</p>
                <h3 className="mt-2 text-lg font-medium text-white">Adjust studio balance</h3>
            </div>

            <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch(`/api/admin/accounts/${studioId}/credits`, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    amount: parsedAmount,
                                    note,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string; balanceAfter?: number };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to adjust credits.");
                            }

                            setMessage(`Credits adjusted. New balance: ${payload.balanceAfter ?? "updated"}.`);
                            setNote("");
                            router.refresh();
                        } catch (creditError) {
                            setError(creditError instanceof Error ? creditError.message : "Unable to adjust credits.");
                        }
                    });
                }}
            >
                <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Amount</label>
                    <input
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        disabled={isPending}
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Note</label>
                    <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        disabled={isPending}
                        rows={4}
                        placeholder="Reason for the credit adjustment."
                        className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                </div>

                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Applying..." : "Apply adjustment"}
                </button>
            </form>

            {!Number.isInteger(parsedAmount) || parsedAmount === 0 ? (
                <p className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    Credit adjustments must be non-zero integers so the ledger stays explicit about grants versus debits.
                </p>
            ) : null}
            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
