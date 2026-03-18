"use client";

import React from "react";
import { Html } from "@react-three/drei";

export const LoadingLabel = React.memo(function LoadingLabel({ text }: { text: string }) {
    return (
        <Html center>
            <div
                className="text-xs px-3 py-1 rounded bg-neutral-950/80 border border-neutral-700 text-neutral-300"
                data-testid="mvp-viewer-loading-label"
            >
                {text}
            </div>
        </Html>
    );
});
