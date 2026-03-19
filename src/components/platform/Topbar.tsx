"use client";

import type { ReactNode } from "react";

import { StatusBadge } from "./StatusBadge";
import { useShellRouteContext } from "./ShellRouteContext";

export function Topbar({
    eyebrow,
    title,
    subtitle,
    statusLabel,
    workspaceSwitcher,
    actions,
}: {
    eyebrow?: string;
    title: string;
    subtitle?: string;
    statusLabel?: string;
    workspaceSwitcher?: ReactNode;
    actions?: ReactNode;
}) {
    const { route } = useShellRouteContext({
        eyebrow,
        title,
        subtitle,
    });

    return (
        <header className="border-b border-[var(--border-soft)] px-6 py-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    {route.eyebrow ? (
                        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#bfd6de]/78">{route.eyebrow}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <h2 className="text-3xl font-medium tracking-tight text-[var(--foreground)]">{route.title}</h2>
                        <StatusBadge label={route.routeBadge} tone={route.routeTone} />
                        {route.projectBadge ? <StatusBadge label={route.projectBadge} tone="neutral" /> : null}
                        {statusLabel ? <StatusBadge label={statusLabel} tone="neutral" /> : null}
                    </div>
                    <p className="mt-2 text-sm font-medium text-[var(--foreground)]">{route.summary}</p>
                    {route.subtitle ? <p className="mt-2 max-w-3xl text-sm leading-6 text-[#b8b1a7]">{route.subtitle}</p> : null}
                </div>
                {workspaceSwitcher || actions ? (
                    <div className="flex flex-col gap-3 lg:items-end">
                        {workspaceSwitcher ? <div className="w-full lg:w-auto">{workspaceSwitcher}</div> : null}
                        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
                    </div>
                ) : null}
            </div>
        </header>
    );
}
