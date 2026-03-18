"use client";

import { useState, useTransition } from "react";

import { useRouter } from "next/navigation";

import type { UserProfileSettings } from "@/server/contracts/account";
import { StatusBadge } from "@/components/platform/StatusBadge";

export function ProfileSettingsForm({
    profile,
}: {
    profile: UserProfileSettings;
}) {
    const router = useRouter();
    const [displayName, setDisplayName] = useState(profile.displayName ?? "");
    const [jobTitle, setJobTitle] = useState(profile.jobTitle ?? "");
    const [timezone, setTimezone] = useState(profile.timezone);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-black/30 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Personal profile</p>
                    <h3 className="mt-2 text-lg font-medium text-white">Identity and account metadata</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge label={profile.onboardingState} tone="info" />
                    {profile.providers.map((provider) => (
                        <StatusBadge key={provider} label={provider} tone="neutral" />
                    ))}
                </div>
            </div>

            <form
                className="mt-5 space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    setError(null);

                    startTransition(async () => {
                        try {
                            const response = await fetch("/api/account/profile", {
                                method: "PATCH",
                                headers: {
                                    "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                    displayName,
                                    jobTitle,
                                    timezone,
                                }),
                            });
                            const payload = (await response.json()) as { success?: boolean; message?: string };
                            if (!response.ok || !payload.success) {
                                throw new Error(payload.message || "Unable to update profile.");
                            }

                            setMessage("Profile settings updated.");
                            router.refresh();
                        } catch (profileError) {
                            setError(profileError instanceof Error ? profileError.message : "Unable to update profile.");
                        }
                    });
                }}
            >
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Email</label>
                        <input
                            value={profile.email}
                            disabled
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-neutral-500 outline-none"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Timezone</label>
                        <input
                            value={timezone}
                            onChange={(event) => setTimezone(event.target.value)}
                            disabled={isPending}
                            placeholder="Europe/Madrid"
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Display name</label>
                        <input
                            value={displayName}
                            onChange={(event) => setDisplayName(event.target.value)}
                            disabled={isPending}
                            placeholder="Amir Boz"
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Job title</label>
                        <input
                            value={jobTitle}
                            onChange={(event) => setJobTitle(event.target.value)}
                            disabled={isPending}
                            placeholder="Founder and creative director"
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-cyan-300/40"
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isPending ? "Saving..." : "Save profile"}
                </button>
            </form>

            {message ? <p className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
            {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </section>
    );
}
