import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Sidebar, type PlatformNavGroup } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({
    navGroups,
    accountLabel,
    environmentLabel,
    eyebrow,
    title,
    subtitle,
    statusLabel,
    workspaceSwitcher,
    actions,
    children,
    className,
}: {
    navGroups: PlatformNavGroup[];
    accountLabel?: string;
    environmentLabel?: string;
    eyebrow?: string;
    title: string;
    subtitle?: string;
    statusLabel?: string;
    workspaceSwitcher?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className="min-h-screen bg-black text-white selection:bg-white/20">
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute left-[-10%] top-[-15%] h-[42rem] w-[42rem] rounded-full bg-[rgba(32,72,94,0.22)] blur-[140px]" />
                <div className="absolute bottom-[-15%] right-[-10%] h-[38rem] w-[38rem] rounded-full bg-[rgba(120,74,30,0.16)] blur-[150px]" />
            </div>

            <div className="flex min-h-screen flex-col lg:flex-row">
                <Sidebar groups={navGroups} accountLabel={accountLabel} environmentLabel={environmentLabel} />

                <main className="flex min-h-screen min-w-0 flex-1 flex-col">
                    <Topbar
                        eyebrow={eyebrow}
                        title={title}
                        subtitle={subtitle}
                        statusLabel={statusLabel}
                        workspaceSwitcher={workspaceSwitcher}
                        actions={actions}
                    />
                    <div className={cn("flex-1 px-6 py-6", className)}>{children}</div>
                </main>
            </div>
        </div>
    );
}
