"use client";

import React from "react";
import { Loader2, Save } from "lucide-react";

import type { SaveState } from "./rightPanelShared";

function formatSaveActionLabel(saveState: SaveState) {
    switch (saveState) {
        case "saving":
            return "Saving";
        case "saved":
            return "Save again";
        case "recovered":
            return "Resave draft";
        case "error":
            return "Retry save";
        default:
            return "Save draft";
    }
}

export const RightPanelHeader = React.memo(function RightPanelHeader({
    activeScene,
    clarityMode,
    onManualSave,
    saveState,
}: {
    activeScene: string | null;
    clarityMode: boolean;
    onManualSave: () => void;
    saveState: SaveState;
}) {
    const railTitle = activeScene ? "Scene handoff" : "Workspace handoff";

    return (
        <div className="shrink-0 border-b border-white/8 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                        {clarityMode ? "Clarity handoff" : "Handoff"}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-medium tracking-tight text-white">{railTitle}</h3>
                        {activeScene ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-neutral-300">
                                {activeScene}
                            </span>
                        ) : null}
                    </div>
                </div>
                <button
                    onClick={onManualSave}
                    disabled={saveState === "saving"}
                    className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                    title="Save scene"
                >
                    {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {formatSaveActionLabel(saveState)}
                </button>
            </div>
        </div>
    );
});
