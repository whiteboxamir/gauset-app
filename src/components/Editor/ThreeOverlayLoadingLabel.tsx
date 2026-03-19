"use client";

import React from "react";
import { Html } from "@react-three/drei";

type LoadingLabelTone = "neutral" | "premium" | "reference" | "safe" | "balanced";

const toneStyles: Record<LoadingLabelTone, { shell: string; accent: string; dot: string }> = {
    neutral: {
        shell: "border-white/12 bg-neutral-950/76 text-neutral-100 shadow-[0_24px_60px_rgba(0,0,0,0.42)]",
        accent: "text-neutral-300",
        dot: "bg-neutral-400",
    },
    premium: {
        shell: "border-amber-300/20 bg-neutral-950/78 text-neutral-50 shadow-[0_24px_60px_rgba(0,0,0,0.42)]",
        accent: "text-amber-100",
        dot: "bg-amber-300",
    },
    reference: {
        shell: "border-sky-300/20 bg-neutral-950/76 text-sky-50 shadow-[0_24px_60px_rgba(0,0,0,0.42)]",
        accent: "text-sky-100",
        dot: "bg-sky-300",
    },
    safe: {
        shell: "border-rose-300/20 bg-neutral-950/76 text-rose-50 shadow-[0_24px_60px_rgba(0,0,0,0.42)]",
        accent: "text-rose-100",
        dot: "bg-rose-300",
    },
    balanced: {
        shell: "border-emerald-300/18 bg-neutral-950/76 text-emerald-50 shadow-[0_24px_60px_rgba(0,0,0,0.42)]",
        accent: "text-emerald-100",
        dot: "bg-emerald-300",
    },
};

export const LoadingLabel = React.memo(function LoadingLabel({
    text,
    subtext,
    accent = "Loading",
    tone = "neutral",
}: {
    text: string;
    subtext?: string;
    accent?: string;
    tone?: LoadingLabelTone;
}) {
    const styles = toneStyles[tone];

    return (
        <Html center>
            <div
                className={`pointer-events-none flex max-w-[20rem] flex-col items-center gap-2 rounded-[1.4rem] border px-4 py-3 text-center backdrop-blur-xl ${styles.shell}`}
                data-testid="mvp-viewer-loading-label"
            >
                <div className={`flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.24em] ${styles.accent}`}>
                    <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
                    {accent}
                </div>
                <div className="text-sm font-medium leading-5 text-white/95">{text}</div>
                {subtext ? <div className="max-w-[17rem] text-[11px] leading-5 text-white/60">{subtext}</div> : null}
            </div>
        </Html>
    );
});
