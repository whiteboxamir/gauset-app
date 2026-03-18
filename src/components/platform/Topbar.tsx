import type { ReactNode } from "react";

import { StatusBadge } from "./StatusBadge";

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
    return (
        <header className="border-b border-white/10 px-6 py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    {eyebrow ? (
                        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">{eyebrow}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <h2 className="text-3xl font-medium tracking-tight text-white">{title}</h2>
                        {statusLabel ? <StatusBadge label={statusLabel} tone="neutral" /> : null}
                    </div>
                    {subtitle ? <p className="mt-2 max-w-3xl text-sm leading-7 text-neutral-400">{subtitle}</p> : null}
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
