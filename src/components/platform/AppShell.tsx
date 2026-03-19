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
        <div className="min-h-screen overflow-hidden bg-[#11161a] text-[var(--foreground)] selection:bg-white/20 supports-[min-height:100dvh]:min-h-dvh">
            <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
                <div className="absolute left-[-10%] top-[-15%] h-[42rem] w-[42rem] rounded-full bg-[rgba(191,214,222,0.16)] blur-[140px]" />
                <div className="absolute bottom-[-15%] right-[-10%] h-[38rem] w-[38rem] rounded-full bg-[rgba(220,195,161,0.13)] blur-[150px]" />
                <div className="absolute bottom-[10%] left-[12%] h-[24rem] w-[24rem] rounded-full bg-[rgba(199,215,200,0.08)] blur-[120px]" />
            </div>

            <div className="flex min-h-screen flex-col overflow-hidden supports-[min-height:100dvh]:min-h-dvh lg:h-screen lg:min-h-0 lg:flex-row" data-testid="app-shell-frame">
                <Sidebar groups={navGroups} accountLabel={accountLabel} environmentLabel={environmentLabel} />

                <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <Topbar
                        eyebrow={eyebrow}
                        title={title}
                        subtitle={subtitle}
                        statusLabel={statusLabel}
                        workspaceSwitcher={workspaceSwitcher}
                        actions={actions}
                    />
                    <div
                        className={cn(
                            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] touch-pan-y [-webkit-overflow-scrolling:touch]",
                            className,
                        )}
                        data-testid="app-shell-scroll-region"
                    >
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
