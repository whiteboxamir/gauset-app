"use client";

import type { ReactNode } from "react";

import Link from "next/link";

import { cn } from "@/lib/utils";

import { isShellNavItemActive, useShellRouteContext } from "./ShellRouteContext";
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
    const { pathname, route } = useShellRouteContext({
        title: "World record library",
    });

    return (
        <aside className="flex w-full shrink-0 flex-col overflow-hidden border-b border-[var(--border-soft)] bg-[#13181d]/88 backdrop-blur-xl lg:h-full lg:max-w-xs lg:border-b-0 lg:border-r">
            <div className="shrink-0 border-b border-[var(--border-soft)] px-5 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#bfd6de]/80">Gauset</p>
                <h1 className="mt-2 text-xl font-medium tracking-tight text-[var(--foreground)]">{route.sidebarTitle}</h1>
                <p className="mt-2 text-sm leading-6 text-[#b8b1a7]">{route.sidebarSummary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge label={route.routeBadge} tone={route.routeTone} />
                    {route.projectBadge ? <StatusBadge label={route.projectBadge} tone="neutral" /> : null}
                    {environmentLabel ? <StatusBadge label={environmentLabel} tone="info" /> : null}
                    {accountLabel ? <StatusBadge label={accountLabel} tone="neutral" /> : null}
                </div>
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-5 [-webkit-overflow-scrolling:touch]">
                <div className="space-y-6">
                    {groups.map((group) => (
                        <section key={group.label}>
                            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9d978f]">{group.label}</p>
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
                                                className="flex items-center gap-3 rounded-2xl border border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-3 text-sm text-[#9d978f]"
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
                                                "hover:border-[var(--border-soft)] hover:bg-[var(--surface-soft)] hover:text-[var(--foreground)]",
                                                isShellNavItemActive(pathname, item.href) ? "border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--foreground)]" : "",
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
