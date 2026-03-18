"use client";

import { Html } from "@react-three/drei";

export function EnvironmentSplatStatus({ text, tone = "loading" }: { text: string; tone?: "loading" | "error" }) {
    const borderClass = tone === "error" ? "border-rose-500/40 text-rose-200" : "border-neutral-700 text-neutral-300";

    return (
        <Html center>
            <div className={`rounded bg-neutral-950/85 px-3 py-1 text-xs ${borderClass} border`}>{text}</div>
        </Html>
    );
}
