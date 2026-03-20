import type { ReactNode } from "react";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { cn } from "@/lib/utils";

const toneStyles = {
    ready: {
        icon: CheckCircle2,
        wrapper: "border-emerald-400/20 bg-emerald-500/10 text-emerald-100",
        iconColor: "text-emerald-200",
    },
    info: {
        icon: Info,
        wrapper: "border-white/10 bg-white/[0.04] text-neutral-200",
        iconColor: "text-cyan-100",
    },
    warning: {
        icon: AlertTriangle,
        wrapper: "border-amber-400/20 bg-amber-500/10 text-amber-100",
        iconColor: "text-amber-200",
    },
    blocked: {
        icon: ShieldAlert,
        wrapper: "border-rose-400/20 bg-rose-500/10 text-rose-100",
        iconColor: "text-rose-200",
    },
} as const;

export function AuthStatusNotice({
    tone,
    title,
    body,
    children,
    className,
}: {
    tone: keyof typeof toneStyles;
    title: string;
    body: string;
    children?: ReactNode;
    className?: string;
}) {
    const style = toneStyles[tone];
    const Icon = style.icon;

    return (
        <div className={cn("rounded-[1.4rem] border p-4", style.wrapper, className)}>
            <div className="flex items-start gap-3">
                <div className={cn("mt-0.5", style.iconColor)}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="space-y-2">
                    <p className="text-sm font-medium text-white">{title}</p>
                    <p className="text-sm leading-7">{body}</p>
                    {children ? <div className="pt-1 text-sm">{children}</div> : null}
                </div>
            </div>
        </div>
    );
}
