"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

export function AdminAccountFlagForm() {
    const router = useRouter();
    const [flagKey, setFlagKey] = useState("admin_console");
    const [studioId, setStudioId] = useState("");
    const [userId, setUserId] = useState("");
    const [flagValueText, setFlagValueText] = useState("true");
    const [reason, setReason] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Account flags</p>
                <h3 className="mt-2 text-lg font-medium text-white">Issue direct overrides</h3>
            </div>

            <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const parsedValue = JSON.parse(flagValueText);
                            const response = await fetch("/api/admin/account-flags", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    flagKey,
                                    studioId: studioId || null,
                                    userId: userId || null,
                                    flagValue: parsedValue,
                                    reason,
                                    expiresAt: expiresAt || null,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to update account flag.");
                            }

                            setMessage("Account flag updated.");
                            router.refresh();
                        } catch (flagError) {
                            setError(flagError instanceof Error ? flagError.message : "Unable to update account flag.");
                        }
                    });
                }}
            >
                <input
                    value={flagKey}
                    onChange={(event) => setFlagKey(event.target.value)}
                    disabled={isPending}
                    placeholder="Flag key"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                />
                <input
                    value={studioId}
                    onChange={(event) => setStudioId(event.target.value)}
                    disabled={isPending}
                    placeholder="Studio UUID (optional)"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                />
                <input
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    disabled={isPending}
                    placeholder="User UUID (optional)"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                />
                <textarea
                    value={flagValueText}
                    onChange={(event) => setFlagValueText(event.target.value)}
                    disabled={isPending}
                    rows={3}
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40"
                />
                <input
                    value={expiresAt}
                    onChange={(event) => setExpiresAt(event.target.value)}
                    disabled={isPending}
                    placeholder="2026-03-20T10:00:00Z"
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                />
                <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={isPending}
                    rows={3}
                    placeholder="Why this override exists."
                    className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                />
                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Saving..." : "Save account flag"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
