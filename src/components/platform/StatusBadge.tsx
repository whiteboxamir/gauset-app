import { cn } from "@/lib/utils";

const toneClasses = {
    neutral: "border-[var(--border-soft)] bg-[var(--surface-soft)] text-[#ddd5cb]",
    success: "border-[#c7d7c8]/40 bg-[#c7d7c8]/12 text-[#dce7dd]",
    warning: "border-[#dcc3a1]/40 bg-[#dcc3a1]/12 text-[#f3debf]",
    danger: "border-[#d9bfc7]/40 bg-[#d9bfc7]/12 text-[#f0dce2]",
    info: "border-[#bfd6de]/40 bg-[#bfd6de]/12 text-[#deedf1]",
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
                "inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                toneClasses[tone],
                className,
            )}
        >
            {label}
        </span>
    );
}
