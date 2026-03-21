"use client";

import React from "react";
import { Loader2, Save } from "lucide-react";

import type { SaveState } from "./rightPanelShared";

function formatSaveActionLabel(saveState: SaveState) {
    switch (saveState) {
        case "saving":
            return "Saving";
        case "saved":
            return "Save new version";
        case "recovered":
            return "Resave world";
        case "error":
            return "Retry world save";
        default:
            return "Save world";
    }
}

export const RightPanelHeader = React.memo(function RightPanelHeader({
    activeScene,
    canUseAdvancedDensity,
    clarityMode,
    hasSavedVersion,
    isAdvancedDensityEnabled,
    journeyStage,
    onManualSave,
    saveState,
}: {
    activeScene: string | null;
    canUseAdvancedDensity: boolean;
    clarityMode: boolean;
    hasSavedVersion: boolean;
    isAdvancedDensityEnabled: boolean;
    journeyStage: "start" | "unsaved" | "saved";
    onManualSave: () => void;
    saveState: SaveState;
}) {
    const railTitle =
        journeyStage === "start"
            ? "Save unlocks review"
            : hasSavedVersion
              ? "Review and handoff"
              : "Save first version";
    const railEyebrow =
        journeyStage === "start"
            ? "Next milestone"
            : hasSavedVersion
              ? clarityMode
                    ? "Anchored world"
                    : "Handoff"
              : "First durable milestone";
    const saveActionLabel = hasSavedVersion ? formatSaveActionLabel(saveState) : saveState === "saving" ? "Saving first version" : "Save first version";

    return (
        <div className="shrink-0 border-b border-white/8 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-neutral-500">{railEyebrow}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-medium tracking-tight text-white">{railTitle}</h3>
                        {activeScene ? (
                            <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.14em] text-neutral-300">
                                {activeScene}
                            </span>
                        ) : null}
                    </div>
                    <p className="mt-2 text-[11px] leading-5 text-neutral-400">
                        {journeyStage === "saved"
                            ? "Review share and handoff now point at a durable saved world."
                            : "The first save creates the durable record that review, reopen, and handoff can trust."}
                    </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {canUseAdvancedDensity ? (
                        <span
                            className={`inline-flex items-center rounded-full border px-3 py-2 text-[11px] font-medium ${
                                isAdvancedDensityEnabled
                                    ? "border-[#bfd6de]/35 bg-[#bfd6de]/12 text-[#deedf1]"
                                    : "border-[var(--border-soft)] bg-[var(--surface-soft)] text-[#ddd5cb]"
                            }`}
                        >
                            {isAdvancedDensityEnabled ? "Studio view on" : "Studio view available"}
                        </span>
                    ) : null}
                    <button
                        onClick={onManualSave}
                        disabled={saveState === "saving"}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-60"
                        title="Save scene"
                    >
                        {saveState === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        {saveActionLabel}
                    </button>
                </div>
            </div>
        </div>
    );
});
