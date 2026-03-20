"use client";

import { Html } from "@react-three/drei";

export function EnvironmentSplatStatus({
    text,
    tone = "loading",
    placement = "center",
    diagnostics,
}: {
    text: string;
    tone?: "loading" | "error" | "info";
    placement?: "center" | "corner";
    diagnostics?: Record<string, string>;
}) {
    const borderClass =
        tone === "error"
            ? "border-rose-500/40 text-rose-200"
            : tone === "info"
              ? "border-cyan-400/30 text-cyan-100"
              : "border-neutral-700 text-neutral-300";
    const shellClass =
        placement === "corner"
            ? `pointer-events-none absolute left-4 bottom-4 rounded-full bg-neutral-950/82 px-3 py-1 text-[11px] shadow-[0_14px_32px_rgba(0,0,0,0.34)] ${borderClass} border`
            : `rounded bg-neutral-950/85 px-3 py-1 text-xs ${borderClass} border`;

    return (
        <Html center={placement === "center"} fullscreen={placement === "corner"}>
            <div
                className={shellClass}
                data-testid={placement === "corner" ? "mvp-sharp-gaussian-delivery-status" : "mvp-environment-splat-status"}
                {...diagnostics}
            >
                {text}
            </div>
        </Html>
    );
}
