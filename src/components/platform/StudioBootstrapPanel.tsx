"use client";

import { useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { StatusBadge } from "@/components/platform/StatusBadge";
import { cn } from "@/lib/utils";

export function StudioBootstrapPanel({
    id,
    eyebrow = "Workspace bootstrap",
    title = "Create the first studio workspace",
    body = "This provisions the studio record, owner membership, branding shell, and persisted active workspace in one platform action.",
    className,
}: {
    id?: string;
    eyebrow?: string;
    title?: string;
    body?: string;
    className?: string;
}) {
    const router = useRouter();
    const [name, setName] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    return (
        <section
            id={id}
            className={cn(
                "rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]",
                className,
            )}
        >
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">{eyebrow}</p>
                    <h2 className="mt-3 text-2xl font-medium tracking-tight text-white">{title}</h2>
                    <p className="mt-3 text-sm leading-7 text-neutral-300">{body}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label="Owner seat" tone="info" />
                    <StatusBadge label="Branding shell" tone="neutral" />
                    <StatusBadge label="Persists active workspace" tone="success" />
                </div>
            </div>

            <form
                className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr),auto]"
                onSubmit={(event) => {
                    event.preventDefault();
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch("/api/account/studios", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    name,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to create workspace.");
                            }

                            setName("");
                            router.refresh();
                        } catch (studioError) {
                            setError(studioError instanceof Error ? studioError.message : "Unable to create workspace.");
                        }
                    });
                }}
            >
                <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Studio name</label>
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        disabled={isPending}
                        placeholder="Northlight Interiors"
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                    />
                </div>

                <div className="flex items-end">
                    <button
                        type="submit"
                        disabled={isPending}
                        className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 lg:w-auto"
                    >
                        {isPending ? "Creating..." : "Create workspace"}
                    </button>
                </div>
            </form>

            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}

            <p className="mt-4 text-sm text-neutral-500">
                Already invited to a studio? Open the invite link from your email or return to{" "}
                <Link href="/auth/login" className="font-medium text-white transition-opacity hover:opacity-80">
                    account login
                </Link>
                .
            </p>
        </section>
    );
}
