import type { ReactNode } from "react";

import Link from "next/link";
import { KeyRound, ShieldCheck, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export function AuthPanelShell({
    eyebrow,
    title,
    body,
    children,
    footer,
    className,
}: {
    eyebrow: string;
    title: string;
    body: string;
    children: ReactNode;
    footer?: ReactNode;
    className?: string;
}) {
    const launchSignals = [
        {
            icon: KeyRound,
            label: "Entry path",
            value: "Magic link, no passwords",
        },
        {
            icon: ShieldCheck,
            label: "Access posture",
            value: "Invite-first and approved",
        },
        {
            icon: Sparkles,
            label: "Session truth",
            value: "Verified before redirect",
        },
    ];

    return (
        <section className={cn("w-full max-w-6xl", className)}>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.18fr),minmax(24rem,32rem)]">
                <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(94,234,212,0.18),transparent_34%),radial-gradient(circle_at_80%_24%,rgba(251,191,36,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-8 shadow-[0_32px_100px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-10">
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent_34%,transparent_66%,rgba(255,255,255,0.03))]" />
                    <div className="relative">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <Link href="/auth/login" className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-100/80 transition-opacity hover:opacity-80">
                                Gauset
                            </Link>
                            <Link
                                href="/auth/login"
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                            >
                                Log in
                            </Link>
                        </div>

                        <p className="mt-12 text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-100/70">{eyebrow}</p>
                        <h1 className="mt-4 max-w-3xl text-4xl font-medium tracking-[-0.04em] text-white sm:text-5xl">{title}</h1>
                        <p className="mt-5 max-w-2xl text-sm leading-8 text-neutral-200/80 sm:text-[0.98rem]">{body}</p>

                        <div className="mt-10 grid gap-3 sm:grid-cols-3">
                            {launchSignals.map((signal) => {
                                const Icon = signal.icon;

                                return (
                                    <div key={signal.label} className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                                        <Icon className="h-4 w-4 text-cyan-100/80" />
                                        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-400">{signal.label}</p>
                                        <p className="mt-2 text-sm font-medium text-white">{signal.value}</p>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-10 rounded-[1.6rem] border border-white/10 bg-black/25 p-5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-100/70">Launch rule</p>
                            <p className="mt-3 text-sm leading-7 text-neutral-300">
                                Marketing stays on <span className="font-medium text-white">gauset.com</span>. Authentication and product access stay on the
                                dedicated app surface so the public landing page never gets dragged into app routing.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,19,0.94),rgba(7,12,19,0.84))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:p-8">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
                    <div className="relative">
                        {children}
                        {footer ? <div className="mt-8 border-t border-white/10 pt-5">{footer}</div> : null}
                    </div>
                </div>
            </div>
        </section>
    );
}
