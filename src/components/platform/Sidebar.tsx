import type { ReactNode } from "react";

import Link from "next/link";

import { cn } from "@/lib/utils";

import { StatusBadge } from "./StatusBadge";

export interface PlatformNavItem {
    href: string;
    label: string;
    badge?: string;
    disabled?: boolean;
}

export interface PlatformNavGroup {
    label: string;
    items: PlatformNavItem[];
}

export function Sidebar({
    groups,
    accountLabel,
    environmentLabel,
    footerSlot,
}: {
    groups: PlatformNavGroup[];
    accountLabel?: string;
    environmentLabel?: string;
    footerSlot?: ReactNode;
}) {
    return (
        <aside className="flex w-full max-w-xs shrink-0 flex-col border-r border-white/10 bg-black/40 backdrop-blur-xl">
            <div className="border-b border-white/10 px-5 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Gauset workflow</p>
                <h1 className="mt-3 text-xl font-medium tracking-tight text-white">World-first shell</h1>
                <div className="mt-4 flex flex-wrap gap-2">
                    {environmentLabel ? <StatusBadge label={environmentLabel} tone="info" /> : null}
                    {accountLabel ? <StatusBadge label={accountLabel} tone="neutral" /> : null}
                </div>
            </div>

            <nav className="flex-1 overflow-y-auto px-4 py-5">
                <div className="space-y-6">
                    {groups.map((group) => (
                        <section key={group.label}>
                            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-500">{group.label}</p>
                            <div className="mt-2 space-y-1">
                                {group.items.map((item) => {
                                    const content = (
                                        <>
                                            <span>{item.label}</span>
                                            {item.badge ? <StatusBadge label={item.badge} tone="neutral" className="ml-auto" /> : null}
                                        </>
                                    );

                                    if (item.disabled) {
                                        return (
                                            <div
                                                key={item.href}
                                                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-3 text-sm text-neutral-500"
                                            >
                                                {content}
                                            </div>
                                        );
                                    }

                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={cn(
                                                "flex items-center gap-3 rounded-2xl border border-transparent px-3 py-3 text-sm text-neutral-300 transition-all duration-200",
                                                "hover:border-white/10 hover:bg-white/[0.04] hover:text-white",
                                            )}
                                        >
                                            {content}
                                        </Link>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </nav>

            {footerSlot ? <div className="border-t border-white/10 px-4 py-4">{footerSlot}</div> : null}
        </aside>
    );
}
