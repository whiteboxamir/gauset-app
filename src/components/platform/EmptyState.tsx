import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
    eyebrow,
    title,
    body,
    actions,
    className,
}: {
    eyebrow?: string;
    title: string;
    body: string;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <section
            className={cn(
                "rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-8 shadow-[0_24px_80px_rgba(0,0,0,0.28)]",
                className,
            )}
        >
            {eyebrow ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">{eyebrow}</p>
            ) : null}
            <h2 className="mt-3 text-2xl font-medium tracking-tight text-white">{title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">{body}</p>
            {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
        </section>
    );
}
