"use client";

import { useEffect, useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { StudioWorkspaceSummary } from "@/server/contracts/account";
import { StudioBootstrapPanel } from "@/components/platform/StudioBootstrapPanel";
import { StatusBadge } from "@/components/platform/StatusBadge";

export function StudioSettingsForm({
    studio,
}: {
    studio: StudioWorkspaceSummary | null;
}) {
    const router = useRouter();
    const canManageStudio = studio ? studio.role === "owner" || studio.role === "admin" : false;
    const [name, setName] = useState(studio?.name ?? "");
    const [billingEmail, setBillingEmail] = useState(studio?.billingEmail ?? "");
    const [supportEmail, setSupportEmail] = useState(studio?.supportEmail ?? "");
    const [accentColor, setAccentColor] = useState(studio?.accentColor ?? "");
    const [websiteUrl, setWebsiteUrl] = useState(studio?.websiteUrl ?? "");
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setName(studio?.name ?? "");
        setBillingEmail(studio?.billingEmail ?? "");
        setSupportEmail(studio?.supportEmail ?? "");
        setAccentColor(studio?.accentColor ?? "");
        setWebsiteUrl(studio?.websiteUrl ?? "");
        setMessage(null);
        setError(null);
    }, [studio]);

    if (!studio) {
        return (
            <StudioBootstrapPanel
                eyebrow="Studio setup"
                title="Create a workspace before editing studio settings"
                body="Studio profile controls stay empty until a real workspace is active. Creating the first studio here provisions the branding shell and mounts it as the persisted active workspace."
            />
        );
    }

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Studio profile</p>
                    <h3 className="mt-2 text-lg font-medium text-white">{studio.name}</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={studio.role} tone="info" />
                    <StatusBadge label={`${studio.seatCount} seats`} tone="neutral" />
                    <StatusBadge label={`${studio.pendingInvitationCount} pending`} tone="warning" />
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-3">
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Billing contact</p>
                    <p className="mt-2 text-sm font-medium text-white">{studio.billingEmail ?? "Missing billing email"}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">Internal operators use this for invoice ownership and renewal handoff.</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Support contact</p>
                    <p className="mt-2 text-sm font-medium text-white">{studio.supportEmail ?? "Missing support email"}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">Support threads and partner-facing escalation posture anchor to this contact record.</p>
                </article>
                <article className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Website</p>
                    <p className="mt-2 text-sm font-medium text-white">{studio.websiteUrl ?? "No studio website recorded"}</p>
                    <p className="mt-2 text-sm leading-6 text-neutral-400">This is visibility metadata for operators. It does not imply live rollout proof by itself.</p>
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
                            const response = await fetch("/api/account/studio", {
                                method: "PATCH",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    name,
                                    billingEmail,
                                    supportEmail,
                                    accentColor,
                                    websiteUrl,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to update studio settings.");
                            }

                            setMessage("Studio settings updated.");
                            router.refresh();
                        } catch (studioError) {
                            setError(studioError instanceof Error ? studioError.message : "Unable to update studio settings.");
                        }
                    });
                }}
            >
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2 lg:col-span-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Studio name</label>
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            disabled={!canManageStudio || isPending}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Billing email</label>
                        <input
                            value={billingEmail}
                            onChange={(event) => setBillingEmail(event.target.value)}
                            disabled={!canManageStudio || isPending}
                            placeholder="billing@gauset.com"
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Support email</label>
                        <input
                            value={supportEmail}
                            onChange={(event) => setSupportEmail(event.target.value)}
                            disabled={!canManageStudio || isPending}
                            placeholder="ops@gauset.com"
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Accent color</label>
                        <input
                            value={accentColor}
                            onChange={(event) => setAccentColor(event.target.value)}
                            disabled={!canManageStudio || isPending}
                            placeholder="#0ea5e9"
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Website</label>
                        <input
                            value={websiteUrl}
                            onChange={(event) => setWebsiteUrl(event.target.value)}
                            disabled={!canManageStudio || isPending}
                            placeholder="https://gauset.com"
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40 disabled:text-neutral-500"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={!canManageStudio || isPending}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Saving..." : canManageStudio ? "Save studio profile" : "Read-only access"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
