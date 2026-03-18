import { cn } from "@/lib/utils";

const toneClasses = {
    neutral: "border-white/10 bg-white/[0.05] text-white/80",
    success: "border-emerald-400/25 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-400/25 bg-amber-500/10 text-amber-100",
    danger: "border-rose-400/25 bg-rose-500/10 text-rose-100",
    info: "border-sky-400/25 bg-sky-500/10 text-sky-100",
} as const;

export function StatusBadge({
    label,
    tone = "neutral",
    className,
}: {
    label: string;
    tone?: keyof typeof toneClasses;
    className?: string;
}) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]",
                toneClasses[tone],
                className,
            )}
        >
            {label}
        </span>
    );
}
