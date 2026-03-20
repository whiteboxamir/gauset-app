"use client";

import { useEffect, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import type { AccessibleStudioSummary } from "@/server/contracts/account";
import type { CoverageSnapshot } from "@/server/contracts/coverage";
import type { CoordinationWorkload } from "@/server/contracts/coordination";
import type { OperationsSnapshot } from "@/server/contracts/operations";

import { StatusBadge } from "./StatusBadge";

export function WorkspaceSwitcher({
    studios,
    activeStudioId,
    workload,
    operations,
    coverage,
}: {
    studios: AccessibleStudioSummary[];
    activeStudioId: string | null;
    workload?: CoordinationWorkload | null;
    operations?: OperationsSnapshot | null;
    coverage?: CoverageSnapshot | null;
}) {
    const router = useRouter();
    const [selectedStudioId, setSelectedStudioId] = useState(activeStudioId ?? studios[0]?.studioId ?? "");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setSelectedStudioId(activeStudioId ?? studios.find((studio) => studio.isActive)?.studioId ?? studios[0]?.studioId ?? "");
    }, [activeStudioId, studios]);

    const activeStudio = studios.find((studio) => studio.studioId === (activeStudioId ?? selectedStudioId)) ?? studios[0] ?? null;
    const coverageLabel = coverage?.health ?? workload?.coverageHealth ?? null;
    const coverageTone =
        coverageLabel === "stable" ? "success" : coverageLabel === "overloaded" ? "danger" : coverageLabel ? "warning" : "neutral";
    const workloadSummary =
        operations && operations.urgentCount > 0
            ? `${operations.urgentCount} blocker${operations.urgentCount === 1 ? "" : "s"} on saved-world operations`
            : operations && operations.watchCount > 0
              ? `${operations.watchCount} watch item${operations.watchCount === 1 ? "" : "s"} across the studio`
              : "No active blockers on the current world-record flow";

    if (studios.length === 0) {
        return (
            <div data-testid="workspace-switcher" className="min-w-[260px] rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Studio</p>
                <p className="mt-3 text-sm font-medium text-white">No studio is active yet</p>
                <p className="mt-2 text-sm leading-6 text-neutral-400">Create the first studio to unlock shared project records, team access, and authenticated review delivery.</p>
                <Link href="/app/dashboard#studio-bootstrap" className="mt-4 inline-flex text-sm font-medium text-white transition-opacity hover:opacity-80">
                    Open bootstrap
                </Link>
            </div>
        );
    }

    return (
        <div data-testid="workspace-switcher" className="min-w-[280px] rounded-[1.35rem] border border-white/10 bg-black/25 p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/70">Active studio</p>
                    <p data-testid="workspace-switcher-active-name" className="mt-2 text-sm font-medium text-white">
                        {activeStudio?.name ?? "Studio"}
                    </p>
                    <p data-testid="workspace-switcher-active-role" className="mt-1 text-xs text-neutral-500">
                        {activeStudio ? `${activeStudio.role} access` : "No role mounted"}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-neutral-500">This studio owns the authenticated project records in this shell.</p>
                    {workload || operations || coverageLabel ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                            {coverageLabel ? <StatusBadge label={`Coverage ${coverageLabel}`} tone={coverageTone} /> : null}
                            <StatusBadge
                                label={workloadSummary}
                                tone={operations?.urgentCount ? "danger" : operations?.watchCount ? "warning" : "neutral"}
                            />
                        </div>
                    ) : null}
                </div>
                <StatusBadge label={`${studios.length} live`} tone="neutral" />
            </div>

            <div className="mt-4 space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-400">Switch active studio</label>
                <select
                    data-testid="workspace-switcher-select"
                    value={selectedStudioId}
                    disabled={isPending || studios.length === 1}
                    onChange={(event) => {
                        const nextStudioId = event.target.value;
                        setSelectedStudioId(nextStudioId);
                        setError(null);

                        if (!nextStudioId || nextStudioId === activeStudioId) {
                            return;
                        }

                        startTransition(async () => {
                            try {
                                const response = await fetch("/api/account/active-studio", {
                                    method: "PATCH",
                                    headers: {
                                        "Content-Type": "application/json",
                                    },
                                    body: JSON.stringify({
                                        studioId: nextStudioId,
                                    }),
                                });
                                const payload = (await response.json()) as { success?: boolean; message?: string };
                                if (!response.ok || !payload.success) {
                                    throw new Error(payload.message || "Unable to switch active studio.");
                                }

                                router.refresh();
                            } catch (switchError) {
                                setSelectedStudioId(activeStudioId ?? studios.find((studio) => studio.isActive)?.studioId ?? studios[0]?.studioId ?? "");
                                setError(switchError instanceof Error ? switchError.message : "Unable to switch active studio.");
                            }
                        });
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/40 disabled:text-neutral-500"
                >
                    {studios.map((studio) => (
                        <option key={studio.studioId} value={studio.studioId} className="bg-neutral-950 text-white">
                            {studio.name} ({studio.role})
                        </option>
                    ))}
                </select>
            </div>

            {error ? (
                <p data-testid="workspace-switcher-error" className="mt-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
